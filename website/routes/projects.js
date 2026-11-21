const express = require('express');

const router = express.Router();

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
function findProjects(query, callback) {

    const text = (value) =>
        typeof value === 'string' ? value.trim() : '';

    const company_id = text(query.company_id);
    const status_id = text(query.status_id);
    const keyword = text(query.q);

    const conditions = [];
    const params = [];

    if (company_id) {
        conditions.push('p.company_id = ?');
        params.push(company_id);
    }

    if (status_id) {
        conditions.push('p.status_id = ?');
        params.push(status_id);
    }

    if (keyword) {
        conditions.push('(p.project_name LIKE ? OR p.location LIKE ?)');
        params.push('%' + keyword + '%', '%' + keyword + '%');
    }

    const extraSQL =
        (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '') +
        ' ORDER BY p.start_date DESC, p.project_name';

    queryProjects(extraSQL, params, callback);
}


// READ: Project list page (filters, search and all projects)
router.get('/', (req, res) => {

    loadOptions((err, options) => {

        if (err) {
            console.error('Error fetching companies or statuses:', err);
            return res.status(500).send('Unable to retrieve companies or statuses.');
        }

        findProjects(req.query, (err, data) => {

            if (err) {
                console.error('Error fetching projects:', err);
                return res.status(500).send('Unable to retrieve projects.');
            }

            res.render('projects/index', {
                companies: options.companies,
                statuses: options.statuses,
                data: data
            });
        });
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

module.exports = router;