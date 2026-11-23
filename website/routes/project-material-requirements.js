
const express = require('express');
const { randomUUID } = require('node:crypto');

const router = express.Router({
    mergeParams: true
});

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// ============================================================
// GENERAL HELPERS
// ============================================================

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function db() {
    return router.connection.promise();
}

async function findProject(projectId) {
    const [rows] = await db().execute(
        `SELECT project_id, project_name
         FROM projects
         WHERE project_id = ?`,
        [projectId]
    );

    return rows[0] || null;
}

async function findActivities(projectId) {
    const [rows] = await db().execute(
        `SELECT activity_id, activity_name
         FROM project_activities
         WHERE project_id = ?
         ORDER BY
             (start_date IS NULL),
             start_date,
             activity_name,
             activity_id`,
        [projectId]
    );

    return rows;
}

// ============================================================
// PAGINATION AND FILTERING
// ============================================================

function readFilters(query) {
    const q = text(query.q);
    const activity_id = text(query.activity_id);
    const procurement = text(query.procurement);

    const size = Number(query.page_size);

    const pageSize = PAGE_SIZE_OPTIONS.includes(size)
        ? size
        : DEFAULT_PAGE_SIZE;

    const requestedPage = Number(query.page);

    const page = (
        Number.isSafeInteger(requestedPage) &&
        requestedPage > 0
    ) ? requestedPage : 1;

    return {
        q,
        activity_id,
        procurement,
        pageSize,
        page
    };
}

function buildPageUrl(projectId, filters, page) {
    const params = new URLSearchParams();

    if (filters.q) params.set('q', filters.q);
    if (filters.activity_id) {
        params.set('activity_id', filters.activity_id);
    }
    if (filters.procurement) {
        params.set('procurement', filters.procurement);
    }

    params.set('page_size', String(filters.pageSize));
    params.set('page', String(page));

    return `/projects/${encodeURIComponent(projectId)}/material-requirements/list?${params.toString()}`;
}

async function findRequirements(projectId, query) {
    const filters = readFilters(query);

    const conditions = [
        'pa.project_id = ?'
    ];

    const params = [projectId];

    if (filters.q) {
        conditions.push(`(
            m.material_name LIKE ?
            OR m.material_id LIKE ?
            OR pa.activity_name LIKE ?
        )`);

        const keyword = '%' + filters.q + '%';
        params.push(keyword, keyword, keyword);
    }

    if (filters.activity_id) {
        conditions.push('pmr.activity_id = ?');
        params.push(filters.activity_id);
    }

    const poExistsSQL = `
        EXISTS (
            SELECT 1
            FROM purchase_order_items poi
            WHERE poi.requirement_id = pmr.requirement_id
        )
    `;

    if (filters.procurement === 'linked') {
        conditions.push(poExistsSQL);
    } else if (filters.procurement === 'unlinked') {
        conditions.push('NOT ' + poExistsSQL);
    }

    const whereSQL = 'WHERE ' + conditions.join(' AND ');

    const countSQL = `
        SELECT COUNT(*) AS total
        FROM project_materials_requirements pmr
        JOIN project_activities pa
            ON pmr.activity_id = pa.activity_id
        JOIN materials m
            ON pmr.material_id = m.material_id
        ${whereSQL}
    `;

    const [countRows] = await db().execute(
        countSQL,
        params
    );

    const total = Number(countRows[0].total);
    const totalPages = Math.max(
        Math.ceil(total / filters.pageSize),
        1
    );

    const page = Math.min(filters.page, totalPages);
    const offset = (page - 1) * filters.pageSize;

    const SQL = `
        SELECT
            pmr.requirement_id,
            pmr.material_id,
            pmr.activity_id,
            pmr.required_quantity,
            pmr.notes,

            DATE_FORMAT(
                pmr.required_date,
                '%d/%m/%Y'
            ) AS required_date_display,

            DATE_FORMAT(
                pmr.required_date,
                '%Y-%m-%d'
            ) AS required_date,

            m.material_name,
            m.unit,
            m.specification,
            m.is_active AS material_active,

            pa.activity_name,

            ${poExistsSQL} AS is_linked,

            (
                SELECT COUNT(*)
                FROM purchase_order_items poi
                WHERE poi.requirement_id = pmr.requirement_id
            ) AS po_item_count

        FROM project_materials_requirements pmr

        JOIN project_activities pa
            ON pmr.activity_id = pa.activity_id

        JOIN materials m
            ON pmr.material_id = m.material_id

        ${whereSQL}

        ORDER BY
            pmr.required_date ASC,
            pa.activity_name ASC,
            m.material_name ASC,
            pmr.requirement_id ASC

        LIMIT ${filters.pageSize}
        OFFSET ${offset}
    `;

    const [requirements] = await db().execute(
        SQL,
        params
    );

    requirements.forEach(requirement => {
        requirement.is_linked = Boolean(requirement.is_linked);
        requirement.canModify = !requirement.is_linked;
        requirement.po_item_count = Number(
            requirement.po_item_count
        );
        requirement.required_quantity = Number(
            requirement.required_quantity
        ).toString();
    });

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
        requirements,
        total,
        page,
        pageSize: filters.pageSize,
        pages,

        showPagination: totalPages > 1,
        hasPrevious: page > 1,
        hasNext: page < totalPages,

        firstUrl: buildPageUrl(projectId, filters, 1),
        previousUrl: buildPageUrl(projectId, filters, page - 1),
        nextUrl: buildPageUrl(projectId, filters, page + 1),
        lastUrl: buildPageUrl(projectId, filters, totalPages),

        startRecord: total === 0 ? 0 : offset + 1,
        endRecord: Math.min(
            offset + filters.pageSize,
            total
        )
    };
}

// ============================================================
// FORM VALIDATION
// ============================================================

function readRequirementForm(body) {
    return {
        material_id: text(body.material_id),
        activity_id: text(body.activity_id),
        required_quantity: text(body.required_quantity),
        required_date: text(body.required_date),
        notes: text(body.notes)
    };
}

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

function validateRequirement(requirement) {
    if (!requirement.activity_id) {
        return 'Please select a project activity.';
    }

    if (!requirement.material_id) {
        return 'Please select a material from the catalog.';
    }

    if (!/^\d{1,12}(\.\d{1,3})?$/.test(
        requirement.required_quantity
    )) {
        return 'Quantity must be a positive number with up to three decimal places and twelve integer digits.';
    }

    const quantity = Number(
        requirement.required_quantity
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return 'Required quantity must be greater than zero.';
    }

    if (!isValidDate(requirement.required_date)) {
        return 'Please select a valid required date.';
    }

    return null;
}

async function checkFormReferences(projectId, requirement) {
    const [activities] = await db().execute(
        `SELECT activity_id
         FROM project_activities
         WHERE activity_id = ?
           AND project_id = ?`,
        [requirement.activity_id, projectId]
    );

    if (activities.length === 0) {
        return 'The selected activity does not belong to this project.';
    }

    const [materials] = await db().execute(
        `SELECT material_id
         FROM materials
         WHERE material_id = ?
           AND is_active = 1`,
        [requirement.material_id]
    );

    if (materials.length === 0) {
        return 'The selected material is unavailable or inactive.';
    }

    return null;
}

// ============================================================
// MATERIAL CATALOG
// ============================================================

router.get('/catalog', async (req, res) => {
    const q = text(req.query.q);

    try {
        if (!(await findProject(req.params.projectId))) {
            return res.status(404).send('Project not found.');
        }

        if (q.length < 2) {
            return res.render(
                'project-material-requirements/catalog-results',
                { minimumSearch: true }
            );
        }

        const SQL = `
            SELECT
                material_id,
                material_name,
                unit
            FROM materials
            WHERE is_active = 1
              AND (
                  material_name LIKE ?
                  OR material_id LIKE ?
              )
            ORDER BY material_name, material_id
            LIMIT 30
        `;

        const keyword = '%' + q + '%';

        const [materials] = await db().execute(
            SQL,
            [keyword, keyword]
        );

        res.render(
            'project-material-requirements/catalog-results',
            { materials, hasSearch: true }
        );

    } catch (err) {
        console.error('Error searching materials:', err);
        res.status(500).send(
            'Unable to search the Materials Catalog.'
        );
    }
});

// ============================================================
// READ: SINGLE REQUIREMENT
// ============================================================

async function findRequirement(projectId, requirementId) {
    const SQL = `
        SELECT
            pmr.requirement_id,
            pmr.material_id,
            pmr.activity_id,
            pmr.required_quantity,
            pmr.notes,

            DATE_FORMAT(
                pmr.required_date,
                '%Y-%m-%d'
            ) AS required_date,

            m.material_name,
            m.unit,

            EXISTS (
                SELECT 1
                FROM purchase_order_items poi
                WHERE poi.requirement_id = pmr.requirement_id
            ) AS is_linked

        FROM project_materials_requirements pmr

        JOIN project_activities pa
            ON pmr.activity_id = pa.activity_id

        JOIN materials m
            ON pmr.material_id = m.material_id

        WHERE pmr.requirement_id = ?
          AND pa.project_id = ?
    `;

    const [rows] = await db().execute(
        SQL,
        [requirementId, projectId]
    );

    if (!rows.length) return null;

    rows[0].is_linked = Boolean(rows[0].is_linked);

    return rows[0];
}

// ============================================================
// FORM RENDERING
// ============================================================

async function renderForm(
    res,
    projectId,
    requirement = {},
    mode = 'add',
    error = null
) {
    const project = await findProject(projectId);

    if (!project) {
        return res.status(404).send('Project not found.');
    }

    const activities = await findActivities(projectId);

    const activityOptions = activities.map(activity => ({
        ...activity,
        selected:
            activity.activity_id === requirement.activity_id
    }));

    let selectedMaterialName =
        requirement.material_name || '';

    let selectedMaterialUnit =
        requirement.unit || '';

    if (requirement.material_id && !selectedMaterialName) {
        const [materials] = await db().execute(
            `SELECT material_name, unit
             FROM materials
             WHERE material_id = ?`,
            [requirement.material_id]
        );

        if (materials.length) {
            selectedMaterialName = materials[0].material_name;
            selectedMaterialUnit = materials[0].unit;
        }
    }

    return res.render(
        'project-material-requirements/form',
        {
            project_id: projectId,
            ...requirement,

            isEdit: mode === 'edit',
            activities: activityOptions,

            selectedMaterialName,
            selectedMaterialUnit,

            form_key: mode === 'edit'
                ? requirement.requirement_id
                : 'new',

            error
        }
    );
}

function sendMessage(res, message, success = false) {
    return res.render(
        'project-material-requirements/message',
        { message, success }
    );
}

// ============================================================
// READ: MAIN PAGE
// ============================================================

router.get('/', async (req, res) => {
    const projectId = req.params.projectId;

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const [result, activities] = await Promise.all([
            findRequirements(projectId, req.query),
            findActivities(projectId)
        ]);

        const filters = readFilters(req.query);

        res.render(
            'project-material-requirements/index',
            {
                ...result,

                q: filters.q,
                activities: activities.map(activity => ({
                    ...activity,
                    selected:
                        activity.activity_id === filters.activity_id
                })),

                linkedSelected:
                    filters.procurement === 'linked',

                unlinkedSelected:
                    filters.procurement === 'unlinked',

                pageSizeOptions: PAGE_SIZE_OPTIONS.map(size => ({
                    value: size,
                    selected: size === result.pageSize
                }))
            }
        );

    } catch (err) {
        console.error('Error loading material requirements:', err);
        res.status(500).send(
            'Unable to retrieve material requirements.'
        );
    }
});

// ============================================================
// READ: FILTERED RESULTS
// ============================================================

router.get('/list', async (req, res) => {
    try {
        if (!(await findProject(req.params.projectId))) {
            return res.status(404).send('Project not found.');
        }

        const result = await findRequirements(
            req.params.projectId,
            req.query
        );

        res.render(
            'project-material-requirements/results',
            result
        );

    } catch (err) {
        console.error('Error retrieving requirements:', err);
        res.status(500).send(
            '<div class="alert alert-danger">Unable to retrieve requirements.</div>'
        );
    }
});

// ============================================================
// READ: OVERVIEW COUNT
// ============================================================

router.get('/count', async (req, res) => {
    try {
        const SQL = `
            SELECT COUNT(*) AS total
            FROM project_materials_requirements pmr
            JOIN project_activities pa
                ON pmr.activity_id = pa.activity_id
            WHERE pa.project_id = ?
        `;

        const [rows] = await db().execute(
            SQL,
            [req.params.projectId]
        );

        res.send(String(rows[0].total));

    } catch (err) {
        console.error('Error retrieving requirement count:', err);
        res.status(500).send(
            'Unable to retrieve requirement count.'
        );
    }
});

// ============================================================
// READ: ADD FORM
// ============================================================

router.get('/new', async (req, res) => {
    try {
        return await renderForm(
            res,
            req.params.projectId
        );

    } catch (err) {
        console.error('Error loading requirement form:', err);
        res.status(500).send('Unable to load requirement form.');
    }
});

// ============================================================
// CREATE: ADD REQUIREMENT
// ============================================================

router.post('/', async (req, res) => {
    const projectId = req.params.projectId;
    const requirement = readRequirementForm(req.body);

    try {
        const project = await findProject(projectId);

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const validationError = validateRequirement(requirement);

        if (validationError) {
            return sendMessage(res, validationError);
        }

        const referenceError = await checkFormReferences(
            projectId,
            requirement
        );

        if (referenceError) {
            return sendMessage(res, referenceError);
        }

        const requirementId = randomUUID();

        // Recheck project/activity/material eligibility
        // as part of the INSERT operation.
        const SQL = `
            INSERT INTO project_materials_requirements (
                requirement_id,
                material_id,
                activity_id,
                required_quantity,
                required_date,
                notes
            )
            SELECT ?, m.material_id, pa.activity_id, ?, ?, ?
            FROM project_activities pa
            JOIN materials m
                ON m.material_id = ?
               AND m.is_active = 1
            WHERE pa.activity_id = ?
              AND pa.project_id = ?
        `;

        const [result] = await db().execute(
            SQL,
            [
                requirementId,
                requirement.required_quantity,
                requirement.required_date,
                requirement.notes || null,
                requirement.material_id,
                requirement.activity_id,
                projectId
            ]
        );

        if (result.affectedRows !== 1) {
            return sendMessage(
                res,
                'The selected material or activity is no longer eligible.'
            );
        }

        res.set(
            'HX-Trigger',
            'requirement-changed, requirement-created'
        );

        return sendMessage(
            res,
            'Material requirement successfully added.',
            true
        );

    } catch (err) {
        console.error('Error adding material requirement:', err);

        if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
            return sendMessage(
                res,
                'Required quantity must be greater than zero.'
            );
        }

        return res.status(500).send(
            'Unable to add the material requirement.'
        );
    }
});

// ============================================================
// READ: EDIT FORM
// ============================================================

router.get('/:requirementId/edit', async (req, res) => {
    const projectId = req.params.projectId;

    try {
        const requirement = await findRequirement(
            projectId,
            req.params.requirementId
        );

        if (!requirement) {
            return res.status(404).send(
                'Requirement not found in the selected project.'
            );
        }

        if (requirement.is_linked) {
            return res.status(409).send(
                'This requirement is linked to a purchase order and cannot be edited.'
            );
        }

        return renderForm(
            res,
            projectId,
            requirement,
            'edit'
        );

    } catch (err) {
        console.error('Error loading Edit Requirement:', err);
        res.status(500).send(
            'Unable to load the Edit Requirement form.'
        );
    }
});

// ============================================================
// UPDATE: EDIT REQUIREMENT
// ============================================================

router.put('/:requirementId', async (req, res) => {
    const projectId = req.params.projectId;
    const requirementId = req.params.requirementId;
    const requirement = readRequirementForm(req.body);

    try {
        const existing = await findRequirement(
            projectId,
            requirementId
        );

        if (!existing) {
            return res.status(404).send(
                'Requirement not found in the selected project.'
            );
        }

        if (existing.is_linked) {
            return sendMessage(
                res,
                'This requirement is linked to a purchase order and cannot be edited.'
            );
        }

        const validationError = validateRequirement(requirement);

        if (validationError) {
            return sendMessage(res, validationError);
        }

        const referenceError = await checkFormReferences(
            projectId,
            requirement
        );

        if (referenceError) {
            return sendMessage(res, referenceError);
        }

        const SQL = `
            UPDATE project_materials_requirements pmr

            JOIN project_activities current_pa
                ON pmr.activity_id = current_pa.activity_id

            JOIN project_activities new_pa
                ON new_pa.activity_id = ?
               AND new_pa.project_id = ?

            JOIN materials m
                ON m.material_id = ?
               AND m.is_active = 1

            SET
                pmr.material_id = m.material_id,
                pmr.activity_id = new_pa.activity_id,
                pmr.required_quantity = ?,
                pmr.required_date = ?,
                pmr.notes = ?

            WHERE pmr.requirement_id = ?
              AND current_pa.project_id = ?

              AND NOT EXISTS (
                  SELECT 1
                  FROM purchase_order_items poi
                  WHERE poi.requirement_id = pmr.requirement_id
              )
        `;

        const [result] = await db().execute(
            SQL,
            [
                requirement.activity_id,
                projectId,
                requirement.material_id,
                requirement.required_quantity,
                requirement.required_date,
                requirement.notes || null,
                requirementId,
                projectId
            ]
        );

        if (result.affectedRows === 0) {
            const current = await findRequirement(
                projectId,
                requirementId
            );

            if (!current || current.is_linked) {
                return sendMessage(
                    res,
                    'This requirement has been removed or linked to a purchase order.'
                );
            }

            // No-op updates may report zero affected rows.
        }

        res.set('HX-Trigger', 'requirement-changed');

        return sendMessage(
            res,
            'Material requirement successfully updated.',
            true
        );

    } catch (err) {
        console.error('Error updating material requirement:', err);

        return res.status(500).send(
            'Unable to update the material requirement.'
        );
    }
});

// ============================================================
// DELETE: REMOVE REQUIREMENT
// ============================================================

router.delete('/:requirementId', async (req, res) => {
    const projectId = req.params.projectId;
    const requirementId = req.params.requirementId;

    try {
        const existing = await findRequirement(
            projectId,
            requirementId
        );

        if (!existing) {
            return sendMessage(
                res,
                'Requirement not found in the selected project.'
            );
        }

        if (existing.is_linked) {
            return sendMessage(
                res,
                'This requirement is linked to purchase order items and cannot be deleted.'
            );
        }

        const SQL = `
            DELETE pmr
            FROM project_materials_requirements pmr

            JOIN project_activities pa
                ON pmr.activity_id = pa.activity_id

            WHERE pmr.requirement_id = ?
              AND pa.project_id = ?

              AND NOT EXISTS (
                  SELECT 1
                  FROM purchase_order_items poi
                  WHERE poi.requirement_id = pmr.requirement_id
              )
        `;

        const [result] = await db().execute(
            SQL,
            [requirementId, projectId]
        );

        if (result.affectedRows === 0) {
            return sendMessage(
                res,
                'Requirement cannot be deleted because it has linked records or has already been removed.'
            );
        }

        res.set('HX-Trigger', 'requirement-changed');

        return sendMessage(
            res,
            'Material requirement successfully deleted.',
            true
        );

    } catch (err) {
        console.error('Error deleting material requirement:', err);

        if (
            err.code === 'ER_ROW_IS_REFERENCED_2' ||
            err.code === 'ER_ROW_IS_REFERENCED'
        ) {
            return sendMessage(
                res,
                'This requirement is referenced by purchase order items and cannot be deleted.'
            );
        }

        return res.status(500).send(
            'Unable to delete the material requirement.'
        );
    }
});

// ============================================================
// READ: PROCUREMENT HANDOFF PREVIEW
// ============================================================

router.get('/:requirementId/handoff', async (req, res) => {
    const projectId = req.params.projectId;

    try {
        const requirement = await findRequirement(
            projectId,
            req.params.requirementId
        );

        if (!requirement) {
            return res.status(404).send(
                'Requirement not found in this project.'
            );
        }

        if (requirement.is_linked) {
            return res.status(409).send(
                'This requirement is already linked to purchase order items.'
            );
        }

        res.render(
            'project-material-requirements/handoff',
            {
                project_id: projectId,
                ...requirement,
                required_quantity_display:
                    Number(requirement.required_quantity).toString()
            }
        );

    } catch (err) {
        console.error('Error loading procurement handoff:', err);
        res.status(500).send(
            'Unable to load procurement handoff.'
        );
    }
});

module.exports = router;
