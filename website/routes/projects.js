const express = require('express');
const {
    randomUUID
} = require('node:crypto');

const router = express.Router();

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;


// Shared SELECT: project with its company and status names, and how many
// members / activities / purchase orders belong to it
const SELECT_PROJECTS = `
    SELECT
        p.project_id,
        p.project_name,
        p.description,
        p.location,
        DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(p.end_date, '%Y-%m-%d') AS end_date,
        DATE_FORMAT(p.start_date, '%d/%m/%Y') AS start_date_display,
        DATE_FORMAT(p.end_date, '%d/%m/%Y') AS end_date_display,
        p.company_id,
        c.company_name,
        p.status_id,
        s.status_name,
        (SELECT COUNT(*) FROM project_members pm
            WHERE pm.project_id = p.project_id) AS members_count,
        (SELECT COUNT(*) FROM project_activities pa
            WHERE pa.project_id = p.project_id) AS activities_count,
        (SELECT COUNT(*) FROM purchase_orders po
            WHERE po.project_id = p.project_id) AS orders_count
    FROM projects p
    JOIN companies c
        ON p.company_id = c.company_id
    JOIN statuses s
        ON p.status_id = s.status_id
`;

// Bootstrap badge colour for each project status
const STATUS_BADGES = {
    'Planned': 'bg-secondary',
    'In Progress': 'bg-primary',
    'On Hold': 'bg-warning text-dark',
    'Completed': 'bg-success',
    'Cancelled': 'bg-danger'
};


// Helper: show an error message above the table.
// HX-Retarget / HX-Reswap tell HTMX to put the message in #project-message
// instead of swapping it into the table row.
function sendError(res, status, message) {
    res.set('HX-Retarget', '#project-message');
    res.set('HX-Reswap', 'innerHTML');

    return res.status(status).send(`
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
}


// Helper: run SELECT_PROJECTS with extra SQL (WHERE / ORDER BY)
function queryProjects(extraSQL, params, callback) {
    router.connection.execute(
        SELECT_PROJECTS + extraSQL,
        params,
        (err, rows) => {
            if (err) {
                return callback(err);
            }

            rows.forEach((row) => {
                row.members_count = Number(row.members_count);
                row.activities_count = Number(row.activities_count);
                row.orders_count = Number(row.orders_count);

                // Total records linked to the project (used to protect deletion)
                row.linked_count =
                    row.members_count + row.activities_count + row.orders_count;

                row.status_badge = STATUS_BADGES[row.status_name] || 'bg-secondary';
            });

            callback(null, rows);
        }
    );
}


// Helper: retrieve the companies and project statuses for the dropdown menus
function loadOptions(callback) {

    const companySQL = `
        SELECT company_id, company_name
        FROM companies
        WHERE is_active = TRUE
        ORDER BY company_name
    `;

    const statusSQL = `
        SELECT status_id, status_name
        FROM statuses
        WHERE status_type = 'Project'
        ORDER BY FIELD(status_name, 'Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled')
    `;

    router.connection.query(companySQL, (err, companies) => {

        if (err) {
            return callback(err);
        }

        router.connection.query(statusSQL, (err, statuses) => {

            if (err) {
                return callback(err);
            }

            callback(null, {
                companies: companies,
                statuses: statuses
            });
        });
    });
}


// Helper: retrieve projects using the company / status filters and keyword search

// Helper: retrieve paginated projects with filters and search
function findProjects(query, callback) {

    const text = (value) =>
        typeof value === 'string' ? value.trim() : '';

    const company_id = text(query.company_id);
    const status_id = text(query.status_id);
    const keyword = text(query.q);

    // Pagination settings
    const requestedSize = Number(query.page_size);

    const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize)
        ? requestedSize
        : DEFAULT_PAGE_SIZE;

    const requestedPage = Math.max(
        parseInt(query.page, 10) || 1,
        1
    );

    const conditions = [];
    const params = [];

    // Company filter
    if (company_id) {
        conditions.push('p.company_id = ?');
        params.push(company_id);
    }

    // Status filter
    if (status_id) {
        conditions.push('p.status_id = ?');
        params.push(status_id);
    }

    // Keyword search
    if (keyword) {
        conditions.push(
            '(p.project_name LIKE ? OR p.location LIKE ?)'
        );

        params.push(
            '%' + keyword + '%',
            '%' + keyword + '%'
        );
    }

    const whereSQL = conditions.length > 0
        ? ' WHERE ' + conditions.join(' AND ')
        : '';

    // Count all matching projects
    const countSQL = `
        SELECT COUNT(*) AS total
        FROM projects p
        ${whereSQL}
    `;

    router.connection.execute(
        countSQL,
        params,
        (err, countRows) => {

            if (err) {
                return callback(err);
            }

            const total = Number(countRows[0].total);

            const totalPages = Math.max(
                Math.ceil(total / pageSize),
                1
            );

            const page = Math.min(requestedPage, totalPages);
            const offset = (page - 1) * pageSize;

            // Retrieve only the requested page
            const extraSQL =
                whereSQL +
                ' ORDER BY p.start_date DESC, p.project_name, p.project_id' +
                ' LIMIT ' + pageSize +
                ' OFFSET ' + offset;

            queryProjects(extraSQL, params, (err, rows) => {

                if (err) {
                    return callback(err);
                }

                // Display up to five consecutive page numbers
                const visibleCount = Math.min(5, totalPages);

                const startPage = Math.max(
                    1,
                    Math.min(
                        page - 2,
                        totalPages - visibleCount + 1
                    )
                );

                const pages = [];

                for (
                    let number = startPage;
                    number < startPage + visibleCount;
                    number++
                ) {
                    pages.push({
                        number: number,
                        active: number === page
                    });
                }

                callback(null, {
                    data: rows,
                    total: total,
                    page: page,
                    totalPages: totalPages,
                    pageSize: pageSize,
                    pageSizeOptions: PAGE_SIZE_OPTIONS.map(size => ({
                        value: size,
                        selected: size === pageSize
                    })),
                    pages: pages,
                    hasPrevious: page > 1,
                    hasNext: page < totalPages,
                    previousPage: page - 1,
                    nextPage: page + 1,
                    firstPage: 1,
                    lastPage: totalPages,
                    startRecord: total === 0 ? 0 : offset + 1,
                    endRecord: Math.min(offset + pageSize, total)
                });
            });
        }
    );
}



// Helper: render one project as a table row
function renderRow(res, project_id) {

    queryProjects(' WHERE p.project_id = ?', [project_id], (err, data) => {

        if (err) {
            console.error('Error fetching project:', err);
            return sendError(res, 500, 'Unable to retrieve project.');
        }

        if (data.length === 0) {
            return sendError(res, 404, 'Project not found.');
        }

        res.render('projects/row', data[0]);
    });
}


// Helper: read the project form fields (used by CREATE and UPDATE)
function readProjectForm(body) {

    const text = (value) =>
        typeof value === 'string' ? value.trim() : '';

    return {
        company_id: text(body.company_id),
        status_id: text(body.status_id),
        project_name: text(body.project_name),
        location: text(body.location),
        description: text(body.description),
        start_date: text(body.start_date),
        end_date: text(body.end_date)
    };
}


// Helper: validate the project form, returns an error message or null
function validateProject(project) {

    const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

    if (!project.project_name || project.project_name.length > 50) {
        return 'Project name is required (maximum 50 characters).';
    }

    if (!project.company_id) {
        return 'Please select a company.';
    }

    if (!project.status_id) {
        return 'Please select a project status.';
    }

    if ((project.start_date && !isDate(project.start_date)) ||
        (project.end_date && !isDate(project.end_date))) {
        return 'Dates must use the format YYYY-MM-DD.';
    }

    // YYYY-MM-DD strings can be compared directly
    if (project.start_date && project.end_date &&
        project.end_date < project.start_date) {
        return 'End date cannot be earlier than start date.';
    }

    return null;
}


// Helper: friendly messages for database errors on CREATE / UPDATE
function sendDatabaseError(res, err, action) {

    console.error('Error ' + action + ' project:', err);

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return sendError(res, 400, 'The selected company or status does not exist.');
    }

    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        return sendError(res, 400, 'End date cannot be earlier than start date.');
    }

    return sendError(res, 500, 'Unable to ' + action + ' project.');
}


// READ: Project list page (filters, search, add form and all projects)
// READ: Project Management main page
router.get('/', (req, res) => {

    loadOptions((err, options) => {

        if (err) {
            console.error('Error fetching project options:', err);

            return res.status(500).send(
                'Unable to retrieve companies or statuses.'
            );
        }

        findProjects(req.query, (err, result) => {

            if (err) {
                console.error('Error fetching projects:', err);

                return res.status(500).send(
                    'Unable to retrieve projects.'
                );
            }

            res.render('projects/index', {
                companies: options.companies,
                statuses: options.statuses,
                ...result
            });
        });
    });
});

// READ: Paginated project results
router.get('/list', (req, res) => {

    findProjects(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching projects:', err);

            return sendError(
                res, 500, 'Unable to retrieve projects.'
            );
        }

        res.render('projects/results', result);
    });
});

// READ: Table rows only (used by the filters and keyword search)
router.get('/list', (req, res) => {

    findProjects(req.query, (err, data) => {

        if (err) {
            console.error('Error fetching projects:', err);
            return sendError(res, 500, 'Unable to retrieve projects.');
        }

        res.render('projects/rows', {
            data: data
        });
    });
});


// CREATE: Add a new project
router.post('/', (req, res) => {

    const project = readProjectForm(req.body);

    const error = validateProject(project);
    if (error) {
        return sendError(res, 400, error);
    }

    const project_id = randomUUID();

    const SQL = `
        INSERT INTO projects
            (project_id, company_id, project_name, description,
             location, start_date, end_date, status_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    router.connection.execute(
        SQL,
        [
            project_id,
            project.company_id,
            project.project_name,
            project.description || null,
            project.location || null,
            project.start_date || null,
            project.end_date || null,
            project.status_id
        ],
        (err) => {

            if (err) {
                return sendDatabaseError(res, err, 'add');
            }

            // Notify the frontend to refresh the paginated project list
            res.set('HX-Trigger', 'project-changed');
            renderRow(res, project_id);

        }
    );
});

// READ: Individual Project Details workspace
router.get('/:id/details', (req, res) => {

    queryProjects(
        ' WHERE p.project_id = ?',
        [req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error fetching project details:', err);

                return res.status(500).send(
                    'Unable to retrieve project details.'
                );
            }

            if (data.length === 0) {
                return res.status(404).send(
                    'Project not found.'
                );
            }


            // Determine the selected tab from the URL
            const validTabs = [
                'overview',
                'activities',
                'members',
                'materials',
                'orders'
            ];

            const requestedTab = req.query.tab;

            const activeTab = validTabs.includes(requestedTab)
                ? requestedTab
                : 'overview';

            // Render the project with the correct active tab
            res.render('projects/details', {
                ...data[0],
                tab_overview: activeTab === 'overview',
                tab_activities: activeTab === 'activities',
                tab_members: activeTab === 'members',
                tab_materials: activeTab === 'materials',
                tab_orders: activeTab === 'orders'
            });

        }
    );
});

// READ: One project as an edit form or as a normal row (Cancel button)
router.get('/:id/:view', (req, res) => {

    if (req.params.view === 'row') {
        return renderRow(res, req.params.id);
    }

    if (req.params.view !== 'edit') {
        return res.status(404).send('Page not found.');
    }

    queryProjects(' WHERE p.project_id = ?', [req.params.id], (err, data) => {

        if (err || data.length === 0) {
            return sendError(res, 404, 'Project not found.');
        }

        loadOptions((err, options) => {

            if (err) {
                return sendError(res, 500, 'Unable to retrieve companies or statuses.');
            }

            const project = data[0];

            // Mark the project's current company and status as selected
            project.companies = options.companies.map((c) => ({
                ...c,
                selected: c.company_id === project.company_id
            }));

            project.statuses = options.statuses.map((s) => ({
                ...s,
                selected: s.status_id === project.status_id
            }));

            res.render('projects/edit', project);
        });
    });
});


// UPDATE: Edit project details and status
router.put('/:id', (req, res) => {

    const project = readProjectForm(req.body);

    const error = validateProject(project);
    if (error) {
        return sendError(res, 400, error);
    }

    const SQL = `
        UPDATE projects
        SET company_id = ?,
            project_name = ?,
            description = ?,
            location = ?,
            start_date = ?,
            end_date = ?,
            status_id = ?
        WHERE project_id = ?
    `;

    router.connection.execute(
        SQL,
        [
            project.company_id,
            project.project_name,
            project.description || null,
            project.location || null,
            project.start_date || null,
            project.end_date || null,
            project.status_id,
            req.params.id
        ],
        (err, result) => {

            if (err) {
                return sendDatabaseError(res, err, 'update');
            }

            if (result.affectedRows === 0) {
                return sendError(res, 404, 'Project not found.');
            }

            renderRow(res, req.params.id);
        }
    );
});


// DELETE: Only remove projects without members, activities or purchase orders
router.delete('/:id', (req, res) => {

    // Step 1: Check what is linked to this project
    queryProjects(' WHERE p.project_id = ?', [req.params.id], (err, data) => {

        if (err) {
            console.error('Error checking project relationships:', err);
            return sendError(res, 500, 'Unable to check project relationships.');
        }

        if (data.length === 0) {
            return sendError(res, 404, 'Project not found.');
        }

        // Step 2: Reject deletion if the project already has linked records
        if (data[0].linked_count > 0) {
            return sendError(
                res,
                409,
                'This project has ' + data[0].members_count + ' members, ' +
                data[0].activities_count + ' activities and ' +
                data[0].orders_count + ' purchase orders. ' +
                'Please change its status to Cancelled instead.'
            );
        }

        // Step 3: Delete the project
        const deleteSQL = `
            DELETE FROM projects
            WHERE project_id = ?
        `;

        router.connection.execute(deleteSQL, [req.params.id], (err, result) => {

            if (err) {
                console.error('Error deleting project:', err);

                // Additional database foreign key protection
                if (
                    err.code === 'ER_ROW_IS_REFERENCED_2' ||
                    err.code === 'ER_ROW_IS_REFERENCED'
                ) {
                    return sendError(
                        res,
                        409,
                        'This project is referenced by other records. Please change its status to Cancelled instead.'
                    );
                }

                return sendError(res, 500, 'Unable to delete project.');
            }

            if (result.affectedRows === 0) {
                return sendError(res, 404, 'Project not found.');
            }

            // Step 4: Empty response removes the row from the table
            // Refresh project results after successful deletion
            res.set('HX-Trigger', 'project-changed');
            res.send('');

        });
    });
});

module.exports = router;