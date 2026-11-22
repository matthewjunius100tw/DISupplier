
const express = require('express');
const { randomUUID } = require('node:crypto');

const router = express.Router({
    mergeParams: true
});

// Pagination settings
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// Bootstrap badge colours for activity statuses
const STATUS_BADGES = {
    'Not Started': 'bg-secondary',
    'In Progress': 'bg-primary',
    'On Hold': 'bg-warning text-dark',
    'Completed': 'bg-success'
};

// Helper: Convert values to trimmed strings
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// Helper: Prepare validated pagination and filter parameters
function readFilters(query) {

    const q = text(query.q);
    const status_id = text(query.status_id);

    const requestedSize = Number(query.page_size);

    const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize)
        ? requestedSize
        : DEFAULT_PAGE_SIZE;

    const parsedPage = Number(query.page);

    const requestedPage =
        Number.isSafeInteger(parsedPage) && parsedPage > 0
            ? parsedPage
            : 1;

    return {
        q,
        status_id,
        pageSize,
        requestedPage
    };
}

// Helper: Create pagination URLs while preserving filters
function buildPageUrl(projectId, filters, page) {

    const params = new URLSearchParams();

    if (filters.q) {
        params.set('q', filters.q);
    }

    if (filters.status_id) {
        params.set('status_id', filters.status_id);
    }

    params.set('page_size', String(filters.pageSize));
    params.set('page', String(page));

    return `/projects/${encodeURIComponent(projectId)}/activities/list?${params.toString()}`;
}

// Helper: Retrieve available Project Activity statuses
async function loadStatuses() {

    const SQL = `
        SELECT status_id, status_name
        FROM statuses
        WHERE status_type = 'Project Activity'
        ORDER BY FIELD(
            status_name,
            'Not Started',
            'In Progress',
            'On Hold',
            'Completed'
        )
    `;

    const [rows] = await router.connection.promise().execute(SQL);

    return rows;
}

// Helper: Retrieve paginated activities for the selected project
async function findActivities(projectId, query) {

    const filters = readFilters(query);

    const conditions = [
        'pa.project_id = ?'
    ];

    const params = [projectId];

    // Search activity names
    if (filters.q) {
        conditions.push('pa.activity_name LIKE ?');
        params.push('%' + filters.q + '%');
    }

    // Filter by activity status
    if (filters.status_id) {
        conditions.push('pa.status_id = ?');
        params.push(filters.status_id);
    }

    const whereSQL = 'WHERE ' + conditions.join(' AND ');

    // Count matching activities
    const countSQL = `
        SELECT COUNT(*) AS total
        FROM project_activities pa
        JOIN statuses s
            ON pa.status_id = s.status_id
            AND s.status_type = 'Project Activity'
        ${whereSQL}
    `;

    const [countRows] = await router.connection.promise().execute(
        countSQL,
        params
    );

    const total = Number(countRows[0].total);

    const totalPages = Math.max(
        Math.ceil(total / filters.pageSize),
        1
    );

    const page = Math.min(
        filters.requestedPage,
        totalPages
    );

    const offset = (page - 1) * filters.pageSize;

    // Retrieve activities for the selected page
    const activitySQL = `
        SELECT
            pa.activity_id,
            pa.project_id,
            pa.activity_name,
            pa.description,
            pa.assigned_to,
            u.first_name AS assigned_name,
            pa.status_id,
            s.status_name,
            DATE_FORMAT(pa.start_date, '%d/%m/%Y') AS start_date,
            DATE_FORMAT(pa.end_date, '%d/%m/%Y') AS end_date,
            pa.created_at,
            pa.updated_at

        FROM project_activities pa

        JOIN statuses s
            ON pa.status_id = s.status_id
            AND s.status_type = 'Project Activity'

        LEFT JOIN users u
            ON pa.assigned_to = u.user_id

        ${whereSQL}

        ORDER BY
            (pa.start_date IS NULL) ASC,
            pa.start_date ASC,
            pa.activity_name ASC,
            pa.activity_id ASC

        LIMIT ${filters.pageSize}
        OFFSET ${offset}
    `;

    const [activities] = await router.connection.promise().execute(
        activitySQL,
        params
    );

    // Apply Bootstrap badges
    activities.forEach((activity) => {
        activity.status_badge =
            STATUS_BADGES[activity.status_name] || 'bg-secondary';
    });

    // Build sliding pagination window (maximum 5 pages)
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
            number,
            active: number === page,
            url: buildPageUrl(projectId, filters, number)
        });
    }

    return {
        project_id: projectId,
        activities,

        total,
        page,
        totalPages,
        pageSize: filters.pageSize,

        q: filters.q,
        status_id: filters.status_id,

        pages,

        hasPrevious: page > 1,
        hasNext: page < totalPages,
        showPagination: totalPages > 1,

        firstUrl: buildPageUrl(projectId, filters, 1),
        previousUrl: buildPageUrl(projectId, filters, page - 1),
        nextUrl: buildPageUrl(projectId, filters, page + 1),
        lastUrl: buildPageUrl(projectId, filters, totalPages),

        startRecord: total === 0 ? 0 : offset + 1,
        endRecord: Math.min(offset + filters.pageSize, total)
    };
}

// READ: Full Project Activities interface
router.get('/', async (req, res) => {

    const projectId = req.params.projectId;

    try {

        // Verify that the selected project exists
        const [projects] = await router.connection.promise().execute(
            'SELECT project_id FROM projects WHERE project_id = ?',
            [projectId]
        );

        if (projects.length === 0) {
            return res.status(404).send('Project not found.');
        }

        const [statuses, result] = await Promise.all([
            loadStatuses(),
            findActivities(projectId, req.query)
        ]);

        // Mark the selected status
        const statusOptions = statuses.map((status) => ({
            ...status,
            selected: status.status_id === result.status_id
        }));

        // Mark the selected page size
        const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({
            value: size,
            selected: size === result.pageSize
        }));

        res.render('project-activities/index', {
            ...result,
            statuses: statusOptions,
            pageSizeOptions,
            allStatusesSelected: !result.status_id
        });

    } catch (err) {

        console.error('Error fetching project activities:', err);

        res.status(500).send(
            'Unable to retrieve project activities.'
        );
    }
});

// READ: Activities results only (HTMX updates)
router.get('/list', async (req, res) => {

    const projectId = req.params.projectId;

    try {

        const result = await findActivities(projectId, req.query);

        res.render('project-activities/results', result);

    } catch (err) {

        console.error('Error fetching activity results:', err);

        res.status(500).send(
            '<div class="alert alert-danger">Unable to retrieve project activities.</div>'
        );
    }
});


// ============================================================
// CREATE ACTIVITY - Helper Functions
// ============================================================

// Helper: Read the submitted activity form
function readActivityForm(body) {

    return {
        activity_name: text(body.activity_name),
        description: text(body.description),
        assigned_to: text(body.assigned_to),
        status_id: text(body.status_id),
        start_date: text(body.start_date),
        end_date: text(body.end_date)
    };
}

// Helper: Validate a real calendar date in YYYY-MM-DD format
function isValidDate(value) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

// Helper: Validate activity form fields
function validateActivity(activity) {

    if (!activity.activity_name) {
        return 'Activity name is required.';
    }

    if (activity.activity_name.length > 150) {
        return 'Activity name cannot exceed 150 characters.';
    }

    if (!activity.status_id) {
        return 'Please select an activity status.';
    }

    if (
        (activity.start_date && !isValidDate(activity.start_date)) ||
        (activity.end_date && !isValidDate(activity.end_date))
    ) {
        return 'Please select valid start and end dates.';
    }

    if (
        activity.start_date &&
        activity.end_date &&
        activity.end_date < activity.start_date
    ) {
        return 'End date cannot be earlier than start date.';
    }

    return null;
}

// Helper: Load eligible project members and activity statuses
async function loadActivityOptions(projectId) {

    // Check whether the selected project exists
    const [projects] = await router.connection.promise().execute(
        `SELECT project_id
         FROM projects
         WHERE project_id = ?`,
        [projectId]
    );

    if (projects.length === 0) {
        return null;
    }

    // Retrieve only active members of the selected project
    // who belong to the project's company
    const memberSQL = `
        SELECT
            u.user_id,
            u.first_name AS member_name

        FROM project_members pm

        JOIN users u
            ON pm.user_id = u.user_id

        JOIN projects p
            ON pm.project_id = p.project_id

        WHERE pm.project_id = ?
          AND u.company_id = p.company_id
          AND u.is_active = 1

        ORDER BY
            u.first_name,
            u.last_name,
            u.user_id
    `;

    const [members] = await router.connection.promise().execute(
        memberSQL,
        [projectId]
    );

    // Retrieve only Project Activity statuses
    const statuses = await loadStatuses();

    return {
        members,
        statuses
    };
}

// Helper: Render Add Activity form
async function renderAddForm(res, projectId, activity = {}, error = null) {

    const options = await loadActivityOptions(projectId);

    if (!options) {
        return res.status(404).send('Project not found.');
    }

    const statusOptions = options.statuses.map((status) => ({

        ...status,

        selected: activity.status_id
            ? status.status_id === activity.status_id
            : status.status_name === 'Not Started'

    }));

    const memberOptions = options.members.map((member) => ({

        ...member,

        selected: member.user_id === activity.assigned_to

    }));

    return res.render('project-activities/add', {

        project_id: projectId,

        ...activity,

        statuses: statusOptions,
        members: memberOptions,

        hasMembers: options.members.length > 0,

        error
    });
}

// CREATE ACTIVITY - Routes
// READ: Display Add Activity form
router.get('/new', async (req, res) => {

    try {

        await renderAddForm(
            res,
            req.params.projectId
        );

    } catch (err) {

        console.error('Error loading Add Activity form:', err);

        res.status(500).send(
            'Unable to load the Add Activity form.'
        );
    }
});


// CREATE: Save a new activity
router.post('/', async (req, res) => {

    const projectId = req.params.projectId;

    const activity = readActivityForm(req.body);

    try {

        // Validate required fields and dates
        const validationError = validateActivity(activity);

        if (validationError) {

            return await renderAddForm(
                res,
                projectId,
                activity,
                validationError
            );
        }

        // Retrieve valid statuses and eligible project members
        const options = await loadActivityOptions(projectId);

        if (!options) {
            return res.status(404).send('Project not found.');
        }

        // Validate the selected activity status
        const validStatus = options.statuses.some(
            status => status.status_id === activity.status_id
        );

        if (!validStatus) {

            return await renderAddForm(
                res,
                projectId,
                activity,
                'The selected activity status is invalid.'
            );
        }

        // Validate membership when a user is assigned
        if (activity.assigned_to) {

            const validMember = options.members.some(
                member => member.user_id === activity.assigned_to
            );

            if (!validMember) {

                return await renderAddForm(
                    res,
                    projectId,
                    activity,
                    'The assigned user must be an active member of this project.'
                );
            }
        }

        // Generate a UUID for the new activity
        const activityId = randomUUID();

        const SQL = `
            INSERT INTO project_activities
            (
                activity_id,
                project_id,
                activity_name,
                description,
                assigned_to,
                status_id,
                start_date,
                end_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await router.connection.promise().execute(
            SQL,
            [
                activityId,
                projectId,
                activity.activity_name,
                activity.description || null,
                activity.assigned_to || null,
                activity.status_id,
                activity.start_date || null,
                activity.end_date || null
            ]
        );

        // Notify HTMX to refresh the activities table
        res.set('HX-Trigger', 'activity-changed');

        // Replace the Add form with a success message
        return res.send(`
            <div class="alert alert-success alert-dismissible fade show"
                 role="alert">

                <i class="bi bi-check-circle me-2"></i>
                Activity successfully added.

                <button type="button"
                        class="btn-close"
                        data-bs-dismiss="alert">
                </button>

            </div>
        `);

    } catch (err) {

        console.error('Error creating project activity:', err);

        const message = (
            err.code === 'ER_NO_REFERENCED_ROW_2' ||
            err.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        )
            ? 'The selected activity information is no longer valid. Please check the form.'
            : 'Unable to create the activity. Please try again.';

        try {

            return await renderAddForm(
                res,
                projectId,
                activity,
                message
            );

        } catch (renderError) {

            console.error('Error rendering activity form:', renderError);

            return res.status(500).send(
                'Unable to create the activity.'
            );
        }
    }
});


// ============================================================
// EDIT ACTIVITY - Helper Functions
// ============================================================

// Helper: Retrieve one activity belonging to the selected project
async function findActivity(projectId, activityId) {

    const SQL = `
        SELECT
            activity_id,
            project_id,
            activity_name,
            description,
            assigned_to,
            status_id,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
        FROM project_activities
        WHERE project_id = ?
          AND activity_id = ?
    `;

    const [rows] = await router.connection.promise().execute(
        SQL,
        [projectId, activityId]
    );

    return rows.length > 0 ? rows[0] : null;
}


// Helper: Render the Edit Activity form
async function renderEditForm(
    res,
    projectId,
    activityId,
    activity,
    error = null
) {

    const options = await loadActivityOptions(projectId);

    if (!options) {
        return res.status(404).send('Project not found.');
    }

    // Mark the currently assigned project member
    const memberOptions = options.members.map((member) => ({
        ...member,
        selected: member.user_id === activity.assigned_to
    }));

    // Mark the current activity status
    const statusOptions = options.statuses.map((status) => ({
        ...status,
        selected: status.status_id === activity.status_id
    }));

    return res.render('project-activities/edit', {
        project_id: projectId,
        activity_id: activityId,

        ...activity,

        members: memberOptions,
        statuses: statusOptions,

        hasMembers: memberOptions.length > 0,
        error
    });
}


// ============================================================
// EDIT ACTIVITY - Routes
// ============================================================

// READ: Display the Edit Activity form
router.get('/:activityId/edit', async (req, res) => {

    const projectId = req.params.projectId;
    const activityId = req.params.activityId;

    try {

        const activity = await findActivity(
            projectId,
            activityId
        );

        if (!activity) {
            return res.status(404).send(
                'Activity not found in the selected project.'
            );
        }

        return await renderEditForm(
            res,
            projectId,
            activityId,
            activity
        );

    } catch (err) {

        console.error('Error loading Edit Activity form:', err);

        return res.status(500).send(
            'Unable to load the Edit Activity form.'
        );
    }
});


// UPDATE: Save changes to an existing activity
router.put('/:activityId', async (req, res) => {

    const projectId = req.params.projectId;
    const activityId = req.params.activityId;

    const activity = readActivityForm(req.body);

    try {

        // Step 1: Verify that the activity belongs to the project
        const existingActivity = await findActivity(
            projectId,
            activityId
        );

        if (!existingActivity) {
            return res.status(404).send(
                'Activity not found in the selected project.'
            );
        }

        // Step 2: Validate submitted fields
        const validationError = validateActivity(activity);

        if (validationError) {

            return await renderEditForm(
                res,
                projectId,
                activityId,
                activity,
                validationError
            );
        }

        // Step 3: Retrieve valid statuses and project members
        const options = await loadActivityOptions(projectId);

        if (!options) {
            return res.status(404).send('Project not found.');
        }

        // Step 4: Validate the activity status
        const validStatus = options.statuses.some(
            status => status.status_id === activity.status_id
        );

        if (!validStatus) {

            return await renderEditForm(
                res,
                projectId,
                activityId,
                activity,
                'The selected activity status is invalid.'
            );
        }

        // Step 5: Validate the assigned project member
        if (activity.assigned_to) {

            const validMember = options.members.some(
                member => member.user_id === activity.assigned_to
            );

            if (!validMember) {

                return await renderEditForm(
                    res,
                    projectId,
                    activityId,
                    activity,
                    'The assigned user must be an active member of this project.'
                );
            }
        }

        // Step 6: Update activity information
        const SQL = `
            UPDATE project_activities
            SET
                activity_name = ?,
                description = ?,
                assigned_to = ?,
                status_id = ?,
                start_date = ?,
                end_date = ?
            WHERE activity_id = ?
              AND project_id = ?
        `;

        const [result] = await router.connection.promise().execute(
            SQL,
            [
                activity.activity_name,
                activity.description || null,
                activity.assigned_to || null,
                activity.status_id,
                activity.start_date || null,
                activity.end_date || null,
                activityId,
                projectId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send(
                'Activity not found in the selected project.'
            );
        }

        // Step 7: Notify HTMX to refresh the table
        res.set('HX-Trigger', 'activity-changed');

        return res.send(`
            <div class="alert alert-success alert-dismissible fade show"
                 role="alert">

                <i class="bi bi-check-circle me-2"></i>
                Activity successfully updated.

                <button type="button"
                        class="btn-close"
                        data-bs-dismiss="alert">
                </button>

            </div>
        `);

    } catch (err) {

        console.error('Error updating project activity:', err);

        const message = (
            err.code === 'ER_NO_REFERENCED_ROW_2' ||
            err.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        )
            ? 'The submitted activity information is no longer valid.'
            : 'Unable to update the activity. Please try again.';

        try {

            return await renderEditForm(
                res,
                projectId,
                activityId,
                activity,
                message
            );

        } catch (renderError) {

            console.error('Error rendering Edit Activity form:', renderError);

            return res.status(500).send(
                'Unable to update the activity.'
            );
        }
    }
});


// ============================================================
// DELETE ACTIVITY
// ============================================================

// Helper: Send a user-friendly deletion message
function sendDeleteMessage(res, message, success = false) {

    const alertClass = success
        ? 'alert-success'
        : 'alert-danger';

    const iconClass = success
        ? 'bi-check-circle'
        : 'bi-exclamation-triangle';

    return res.send(`
        <div class="alert ${alertClass} alert-dismissible fade show"
             role="alert">

            <i class="bi ${iconClass} me-2"></i>
            ${message}

            <button type="button"
                    class="btn-close"
                    data-bs-dismiss="alert"
                    aria-label="Close">
            </button>

        </div>
    `);
}


// DELETE: Remove an activity if no material requirements reference it
router.delete('/:activityId', async (req, res) => {

    const projectId = req.params.projectId;
    const activityId = req.params.activityId;

    try {

        // Step 1: Confirm the activity belongs to this project
        const existingActivity = await findActivity(
            projectId,
            activityId
        );

        if (!existingActivity) {

            return sendDeleteMessage(
                res,
                'Activity not found in the selected project.'
            );
        }

        // Step 2: Check for linked material requirements
        const dependencySQL = `
            SELECT COUNT(*) AS total
            FROM project_materials_requirements
            WHERE activity_id = ?
        `;

        const [dependencyRows] =
            await router.connection.promise().execute(
                dependencySQL,
                [activityId]
            );

        const linkedRequirements =
            Number(dependencyRows[0].total);

        // Step 3: Block deletion if materials depend on this activity
        if (linkedRequirements > 0) {

            return sendDeleteMessage(
                res,
                'This activity has ' + linkedRequirements +
                ' linked material requirements and cannot be deleted. ' +
                'Please manage its linked requirements before deleting it.'
            );
        }

        // Step 4: Delete only from the selected project
        // NOT EXISTS adds protection if a requirement is linked
        // between the dependency check and this statement.
        const deleteSQL = `
            DELETE FROM project_activities
            WHERE activity_id = ?
              AND project_id = ?
              AND NOT EXISTS (
                  SELECT 1
                  FROM project_materials_requirements
                  WHERE activity_id = ?
              )
        `;

        const [result] =
            await router.connection.promise().execute(
                deleteSQL,
                [
                    activityId,
                    projectId,
                    activityId
                ]
            );

        // Step 5: Verify deletion
        if (result.affectedRows === 0) {

            return sendDeleteMessage(
                res,
                'The activity could not be deleted. ' +
                'It may have linked records or may no longer exist.'
            );
        }

        // Step 6: Trigger Activities table refresh
        res.set('HX-Trigger', 'activity-changed');

        return sendDeleteMessage(
            res,
            'Activity successfully deleted.',
            true
        );

    } catch (err) {

        console.error('Error deleting project activity:', err);

        // Foreign key restrictions are the final safety mechanism
        if (
            err.code === 'ER_ROW_IS_REFERENCED_2' ||
            err.code === 'ER_ROW_IS_REFERENCED'
        ) {

            return sendDeleteMessage(
                res,
                'This activity is referenced by other records ' +
                'and cannot be deleted.'
            );
        }

        return res.status(500).send(
            'Unable to delete the activity.'
        );
    }
});

// READ: Project Activities Count for Overview
router.get('/count', async (req, res) => {

    const projectId = req.params.projectId;

    try {

        const SQL = `
             SELECT COUNT(*) AS total
             FROM project_activities
             WHERE project_id = ?
         `;

        const [rows] = await router.connection.promise().execute(
            SQL,
            [projectId]
        );

        return res.send(String(rows[0].total));

    } catch (err) {

        console.error('Error fetching activity count:', err);

        return res.status(500).send(
            'Unable to retrieve activity count.'
        );
    }
});


module.exports = router;