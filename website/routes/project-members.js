const express = require('express');
const { randomUUID } = require('node:crypto');

const router = express.Router({
    mergeParams: true
});

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// ============================================================
// HELPERS
// ============================================================

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function readFilters(query) {
    const q = text(query.q);
    const role_id = text(query.role_id);

    const requestedSize = Number(query.page_size);
    const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize)
        ? requestedSize
        : DEFAULT_PAGE_SIZE;

    const requestedPage = Number(query.page);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    return { q, role_id, pageSize, page };
}

function buildPageUrl(projectId, filters, page) {
    const params = new URLSearchParams();

    if (filters.q) params.set('q', filters.q);
    if (filters.role_id) params.set('role_id', filters.role_id);

    params.set('page_size', String(filters.pageSize));
    params.set('page', String(page));

    return `/projects/${encodeURIComponent(projectId)}/members/list?${params.toString()}`;
}

async function findProject(projectId) {
    const [rows] = await router.connection.promise().execute(
        `SELECT project_id, project_name, company_id
         FROM projects
         WHERE project_id = ?`,
        [projectId]
    );

    return rows[0] || null;
}

async function loadRoles() {
    const [rows] = await router.connection.promise().execute(
        `SELECT role_id, role_name
         FROM roles
         ORDER BY role_name, role_id`
    );

    return rows;
}

async function findMembers(projectId, query) {
    const filters = readFilters(query);

    const conditions = ['pm.project_id = ?'];
    const params = [projectId];

    if (filters.q) {
        conditions.push(`(
            u.first_name LIKE ?
            OR u.last_name LIKE ?
            OR u.email LIKE ?
        )`);

        const keyword = '%' + filters.q + '%';
        params.push(keyword, keyword, keyword);
    }

    if (filters.role_id) {
        conditions.push('u.role_id = ?');
        params.push(filters.role_id);
    }

    const whereSQL = 'WHERE ' + conditions.join(' AND ');

    const countSQL = `
        SELECT COUNT(*) AS total
        FROM project_members pm
        JOIN users u ON pm.user_id = u.user_id
        ${whereSQL}
    `;

    const [countRows] = await router.connection.promise().execute(
        countSQL, params
    );

    const total = Number(countRows[0].total);
    const totalPages = Math.max(
        Math.ceil(total / filters.pageSize), 1
    );

    const page = Math.min(filters.page, totalPages);
    const offset = (page - 1) * filters.pageSize;

    const memberSQL = `
        SELECT
            pm.project_member_id,
            pm.project_id,
            pm.user_id,
            u.first_name AS member_name,
            u.last_name,
            u.email,
            u.phone,
            u.is_active,
            r.role_name,
            DATE_FORMAT(pm.assigned_at, '%d/%m/%Y') AS assigned_date,

            (
                SELECT COUNT(*)
                FROM project_activities pa
                WHERE pa.project_id = pm.project_id
                  AND pa.assigned_to = pm.user_id
            ) AS activities_count

        FROM project_members pm

        JOIN users u
            ON pm.user_id = u.user_id

        JOIN roles r
            ON u.role_id = r.role_id

        ${whereSQL}

        ORDER BY
            u.first_name ASC,
            u.last_name ASC,
            u.user_id ASC

        LIMIT ${filters.pageSize}
        OFFSET ${offset}
    `;

    const [members] = await router.connection.promise().execute(
        memberSQL, params
    );

    members.forEach(member => {
        member.activities_count = Number(member.activities_count);
        member.hasActivities = member.activities_count > 0;
        member.active_badge = member.is_active
            ? 'bg-success'
            : 'bg-secondary';
    });

    const visibleCount = Math.min(5, totalPages);
    const startPage = Math.max(
        1,
        Math.min(page - 2, totalPages - visibleCount + 1)
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
        members,
        total,
        page,
        pageSize: filters.pageSize,
        totalPages,
        pages,

        q: filters.q,
        role_id: filters.role_id,

        showPagination: totalPages > 1,
        hasPrevious: page > 1,
        hasNext: page < totalPages,

        firstUrl: buildPageUrl(projectId, filters, 1),
        previousUrl: buildPageUrl(projectId, filters, page - 1),
        nextUrl: buildPageUrl(projectId, filters, page + 1),
        lastUrl: buildPageUrl(projectId, filters, totalPages),

        startRecord: total === 0 ? 0 : offset + 1,
        endRecord: Math.min(offset + filters.pageSize, total)
    };
}

async function loadAvailableEmployees(projectId) {
    const SQL = `
        SELECT
            u.user_id,
            u.first_name AS employee_name,
            u.last_name,
            u.email,
            r.role_name

        FROM projects p

        JOIN users u
            ON u.company_id = p.company_id

        JOIN roles r
            ON u.role_id = r.role_id

        WHERE p.project_id = ?
          AND u.is_active = 1

          AND NOT EXISTS (
              SELECT 1
              FROM project_members pm
              WHERE pm.project_id = p.project_id
                AND pm.user_id = u.user_id
          )

        ORDER BY
            r.role_name,
            u.first_name,
            u.last_name,
            u.user_id
    `;

    const [rows] = await router.connection.promise().execute(
        SQL, [projectId]
    );

    return rows;
}

function sendMemberMessage(res, message, success = false) {
    return res.render('project-members/message', {
        message,
        success
    });
}

// ============================================================
// READ: MAIN MEMBERS INTERFACE
// ============================================================

router.get('/', async (req, res) => {
    const projectId = req.params.projectId;

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const [result, roles] = await Promise.all([
            findMembers(projectId, req.query),
            loadRoles()
        ]);

        res.render('project-members/index', {
            ...result,
            roles: roles.map(role => ({
                ...role,
                selected: role.role_id === result.role_id
            })),
            pageSizeOptions: PAGE_SIZE_OPTIONS.map(size => ({
                value: size,
                selected: size === result.pageSize
            }))
        });

    } catch (err) {
        console.error('Error loading project members:', err);
        res.status(500).send('Unable to retrieve project members.');
    }
});

// ============================================================
// READ: FILTERED RESULTS
// ============================================================

router.get('/list', async (req, res) => {
    try {
        const project = await findProject(req.params.projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const result = await findMembers(
            req.params.projectId,
            req.query
        );

        res.render('project-members/results', result);

    } catch (err) {
        console.error('Error retrieving member results:', err);
        res.status(500).send(
            '<div class="alert alert-danger">Unable to retrieve members.</div>'
        );
    }
});

// ============================================================
// READ: OVERVIEW MEMBER COUNT
// ============================================================

router.get('/count', async (req, res) => {
    try {
        const [rows] = await router.connection.promise().execute(
            `SELECT COUNT(*) AS total
             FROM project_members
             WHERE project_id = ?`,
            [req.params.projectId]
        );

        res.send(String(rows[0].total));

    } catch (err) {
        console.error('Error retrieving member count:', err);
        res.status(500).send('Unable to retrieve member count.');
    }
});

// ============================================================
// READ: ADD MEMBER FORM
// ============================================================

router.get('/new', async (req, res) => {
    const projectId = req.params.projectId;

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const employees = await loadAvailableEmployees(projectId);

        res.render('project-members/add', {
            project_id: projectId,
            employees,
            hasEmployees: employees.length > 0
        });

    } catch (err) {
        console.error('Error loading Add Member form:', err);
        res.status(500).send('Unable to load Add Member form.');
    }
});

// ============================================================
// CREATE: ADD PROJECT MEMBER
// ============================================================

router.post('/', async (req, res) => {
    const projectId = req.params.projectId;
    const userId = text(req.body.user_id);

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        if (!userId) {
            return sendMemberMessage(res, 'Please select an employee.');
        }

        // Validate active employee and company membership.
        // The INSERT also repeats this condition atomically.
        const SQL = `
            INSERT INTO project_members
                (project_member_id, project_id, user_id)
            SELECT ?, p.project_id, u.user_id

            FROM projects p

            JOIN users u
                ON u.company_id = p.company_id

            WHERE p.project_id = ?
              AND u.user_id = ?
              AND u.is_active = 1

              AND NOT EXISTS (
                  SELECT 1
                  FROM project_members pm
                  WHERE pm.project_id = p.project_id
                    AND pm.user_id = u.user_id
              )
        `;

        const [result] = await router.connection.promise().execute(
            SQL,
            [randomUUID(), projectId, userId]
        );

        if (result.affectedRows === 0) {
            return sendMemberMessage(
                res,
                'This employee is not eligible or is already a project member.'
            );
        }

        res.set('HX-Trigger', 'member-changed, member-added');

        return sendMemberMessage(
            res,
            'Employee successfully added to the project.',
            true
        );

    } catch (err) {
        console.error('Error adding project member:', err);

        if (err.code === 'ER_DUP_ENTRY') {
            return sendMemberMessage(
                res,
                'This employee is already assigned to the project.'
            );
        }

        return res.status(500).send(
            'Unable to add the project member.'
        );
    }
});

// ============================================================
// DELETE: REMOVE PROJECT MEMBER SAFELY
// ============================================================

router.delete('/:memberId', async (req, res) => {
    const projectId = req.params.projectId;
    const memberId = req.params.memberId;

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        // Find the selected membership.
        const [members] = await router.connection.promise().execute(
            `SELECT project_member_id, user_id
             FROM project_members
             WHERE project_member_id = ?
               AND project_id = ?`,
            [memberId, projectId]
        );

        if (members.length === 0) {
            return sendMemberMessage(
                res,
                'Member not found in the selected project.'
            );
        }

        // Check activity assignments.
        const [counts] = await router.connection.promise().execute(
            `SELECT COUNT(*) AS total
             FROM project_activities
             WHERE project_id = ?
               AND assigned_to = ?`,
            [projectId, members[0].user_id]
        );

        const assignedActivities = Number(counts[0].total);

        if (assignedActivities > 0) {
            return sendMemberMessage(
                res,
                `This member is assigned to ${assignedActivities} activities. ` +
                'Reassign or unassign those activities before removing the member.'
            );
        }

        // Delete only the selected project's membership.
        // Repeat the activity check to reduce race conditions.
        const SQL = `
            DELETE FROM project_members
            WHERE project_member_id = ?
              AND project_id = ?
              AND NOT EXISTS (
                  SELECT 1
                  FROM project_activities
                  WHERE project_activities.project_id = ?
                    AND project_activities.assigned_to =
                        project_members.user_id
              )
        `;

        const [result] = await router.connection.promise().execute(
            SQL,
            [memberId, projectId, projectId]
        );

        if (result.affectedRows === 0) {
            return sendMemberMessage(
                res,
                'Unable to remove this member. The membership may have changed.'
            );
        }

        res.set('HX-Trigger', 'member-changed');

        return sendMemberMessage(
            res,
            'Project member successfully removed.',
            true
        );

    } catch (err) {
        console.error('Error removing project member:', err);

        if (
            err.code === 'ER_ROW_IS_REFERENCED_2' ||
            err.code === 'ER_ROW_IS_REFERENCED'
        ) {
            return sendMemberMessage(
                res,
                'This membership is referenced by another record and cannot be removed.'
            );
        }

        return res.status(500).send(
            'Unable to remove the project member.'
        );
    }
});

module.exports = router;
