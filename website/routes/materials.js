const express = require('express');
const {
    randomInt
} = require('node:crypto');

const router = express.Router();

// Number of materials loaded at a time (infinite scroll)
const PAGE_SIZE = 50;

// Shared SELECT: material, its category name, and how many
// supplier / project records use it (used to protect deletion)
const SELECT_MATERIALS = `
    SELECT
        m.material_id,
        m.material_name,
        m.specification,
        m.unit,
        m.is_active,
        m.category_id,
        mc.category_name,
        (SELECT COUNT(*) FROM supplier_materials sm
            WHERE sm.material_id = m.material_id)
        +
        (SELECT COUNT(*) FROM project_materials_requirements pr
            WHERE pr.material_id = m.material_id) AS usage_count
    FROM materials m
    JOIN material_categories mc
        ON m.category_id = mc.category_id
`;


// Helper: show an error message above the table.
// HX-Retarget / HX-Reswap tell HTMX to put the message in #material-message
// instead of swapping it into the table row.
function sendError(res, status, message) {
    res.set('HX-Retarget', '#material-message');
    res.set('HX-Reswap', 'innerHTML');

    return res.status(status).send(`
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
}


// Helper: run SELECT_MATERIALS with extra SQL (WHERE / ORDER BY / LIMIT)
function queryMaterials(extraSQL, params, callback) {
    router.connection.execute(
        SELECT_MATERIALS + extraSQL,
        params,
        (err, rows) => {
            if (err) {
                return callback(err);
            }

            // Make sure usage_count is a number (so {{#if usage_count}} works)
            rows.forEach((row) => {
                row.usage_count = Number(row.usage_count);
            });

            callback(null, rows);
        }
    );
}


// Helper: retrieve all categories for the dropdown menus
function loadCategories(callback) {
    const SQL = `
        SELECT category_id, category_name, is_active
        FROM material_categories
        ORDER BY category_name
    `;

    router.connection.query(SQL, callback);
}


// Helper: retrieve one page of materials using the category filter
// (master-detail) and the keyword search
function findMaterials(query, callback) {

    const category_id =
        typeof query.category_id === 'string' ? query.category_id : '';

    const keyword =
        typeof query.q === 'string' ? query.q.trim() : '';

    const page = Math.max(parseInt(query.page, 10) || 1, 1);

    const conditions = [];
    const params = [];

    if (category_id) {
        conditions.push('m.category_id = ?');
        params.push(category_id);
    }

    if (keyword) {
        conditions.push('(m.material_name LIKE ? OR m.material_id LIKE ?)');
        params.push('%' + keyword + '%', '%' + keyword + '%');
    }

    // LIMIT and OFFSET are numbers calculated by us (not user text),
    // so they are safe to put directly in the SQL.
    // We ask for one extra row to know whether there is another page.
    const extraSQL =
        (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '') +
        ' ORDER BY m.material_name, m.material_id' +
        ' LIMIT ' + (PAGE_SIZE + 1) +
        ' OFFSET ' + ((page - 1) * PAGE_SIZE);

    queryMaterials(extraSQL, params, (err, rows) => {

        if (err) {
            return callback(err);
        }

        const hasMore = rows.length > PAGE_SIZE;

        // URL used by the infinite scroll row to load the next page
        const nextUrl = hasMore ?
            '/materials/list?' + new URLSearchParams({
                category_id: category_id,
                q: keyword,
                page: page + 1
            }) :
            null;

        callback(null, {
            data: rows.slice(0, PAGE_SIZE),
            nextUrl: nextUrl
        });
    });
}


// Helper: render one material as a table row
function renderRow(res, material_id) {

    queryMaterials(' WHERE m.material_id = ?', [material_id], (err, data) => {

        if (err) {
            console.error('Error fetching material:', err);
            return sendError(res, 500, 'Unable to retrieve material.');
        }

        if (data.length === 0) {
            return sendError(res, 404, 'Material not found.');
        }

        res.render('materials/row', data[0]);
    });
}


// Helper: read the material form fields (used by CREATE and UPDATE)
function readMaterialForm(body) {

    const text = (value) =>
        typeof value === 'string' ? value.trim() : '';

    return {
        category_id: text(body.category_id),
        material_name: text(body.material_name),
        unit: text(body.unit),
        specification: text(body.specification)
    };
}


// Helper: validate the material form, returns an error message or null
function validateMaterial(material) {

    if (!material.category_id) {
        return 'Please select a material category.';
    }

    if (!material.material_name || material.material_name.length > 150) {
        return 'Material name is required (maximum 150 characters).';
    }

    if (!material.unit || material.unit.length > 30) {
        return 'Unit is required (maximum 30 characters).';
    }

    return null;
}


// READ: Material list page (filter, search, add form and first page of materials)
router.get('/', (req, res) => {

    loadCategories((err, categories) => {

        if (err) {
            console.error('Error fetching material categories:', err);
            return res.status(500).send('Unable to retrieve material categories.');
        }

        findMaterials(req.query, (err, result) => {

            if (err) {
                console.error('Error fetching materials:', err);
                return res.status(500).send('Unable to retrieve materials.');
            }

            res.render('materials/index', {
                categories: categories,
                data: result.data,
                nextUrl: result.nextUrl
            });
        });
    });
});


// READ: Table rows only (used by category filter, keyword search and infinite scroll)
router.get('/list', (req, res) => {

    findMaterials(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching materials:', err);
            return sendError(res, 500, 'Unable to retrieve materials.');
        }

        res.render('materials/rows', result);
    });
});


// CREATE: Add a new material
router.post('/', (req, res) => {

    const material = readMaterialForm(req.body);

    const error = validateMaterial(material);
    if (error) {
        return sendError(res, 400, error);
    }

    // material_id is VARCHAR(8). The original data uses 8-digit numbers
    // (e.g. 85822412), so new materials also get a random 8-digit number.
    const material_id = String(randomInt(10000000, 100000000));

    const SQL = `
        INSERT INTO materials
            (material_id, category_id, material_name, specification, unit)
        VALUES (?, ?, ?, ?, ?)
    `;

    router.connection.execute(
        SQL,
        [
            material_id,
            material.category_id,
            material.material_name,
            material.specification || null,
            material.unit
        ],
        (err) => {

            if (err) {
                console.error('Error adding material:', err);

                // Very unlikely: the random ID is already used
                if (err.code === 'ER_DUP_ENTRY') {
                    return sendError(res, 409, 'Generated material ID already exists. Please click Add again.');
                }

                if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                    return sendError(res, 400, 'The selected category does not exist.');
                }

                return sendError(res, 500, 'Unable to add material.');
            }

            // Return the newly created table row
            renderRow(res, material_id);
        }
    );
});


// READ: One material as an edit form or as a normal row (Cancel button)
router.get('/:id/:view', (req, res) => {

    if (req.params.view === 'row') {
        return renderRow(res, req.params.id);
    }

    if (req.params.view !== 'edit') {
        return res.status(404).send('Page not found.');
    }

    queryMaterials(' WHERE m.material_id = ?', [req.params.id], (err, data) => {

        if (err || data.length === 0) {
            return sendError(res, 404, 'Material not found.');
        }

        loadCategories((err, categories) => {

            if (err) {
                return sendError(res, 500, 'Unable to retrieve material categories.');
            }

            const material = data[0];

            // Show active categories (and the current one), mark the current one as selected
            material.categories = categories
                .filter((c) => c.is_active || c.category_id === material.category_id)
                .map((c) => ({
                    ...c,
                    selected: c.category_id === material.category_id
                }));

            res.render('materials/edit', material);
        });
    });
});


// UPDATE: Edit material details
router.put('/:id', (req, res) => {

    const material = readMaterialForm(req.body);

    const error = validateMaterial(material);
    if (error) {
        return sendError(res, 400, error);
    }

    const SQL = `
        UPDATE materials
        SET category_id = ?,
            material_name = ?,
            specification = ?,
            unit = ?
        WHERE material_id = ?
    `;

    router.connection.execute(
        SQL,
        [
            material.category_id,
            material.material_name,
            material.specification || null,
            material.unit,
            req.params.id
        ],
        (err, result) => {

            if (err) {
                console.error('Error updating material:', err);

                if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                    return sendError(res, 400, 'The selected category does not exist.');
                }

                return sendError(res, 500, 'Unable to update material.');
            }

            if (result.affectedRows === 0) {
                return sendError(res, 404, 'Material not found.');
            }

            renderRow(res, req.params.id);
        }
    );
});


// UPDATE: Toggle material Active/Inactive status
router.put('/:id/status', (req, res) => {

    const SQL = `
        UPDATE materials
        SET is_active = NOT is_active
        WHERE material_id = ?
    `;

    router.connection.execute(SQL, [req.params.id], (err, result) => {

        if (err) {
            console.error('Error updating material status:', err);
            return sendError(res, 500, 'Unable to update material status.');
        }

        if (result.affectedRows === 0) {
            return sendError(res, 404, 'Material not found.');
        }

        renderRow(res, req.params.id);
    });
});


// DELETE: Only remove materials that are not used by suppliers or projects
router.delete('/:id', (req, res) => {

    // Step 1: Check whether suppliers or project requirements use this material
    const checkSQL = `
        SELECT
            (SELECT COUNT(*) FROM supplier_materials WHERE material_id = ?)
            +
            (SELECT COUNT(*) FROM project_materials_requirements WHERE material_id = ?)
            AS usage_count
    `;

    router.connection.execute(
        checkSQL,
        [req.params.id, req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error checking material relationships:', err);
                return sendError(res, 500, 'Unable to check material relationships.');
            }

            const usageCount = Number(data[0].usage_count);

            // Step 2: Reject deletion if the material is in use
            if (usageCount > 0) {
                return sendError(
                    res,
                    409,
                    'This material is used by ' + usageCount +
                    ' supplier/project records. Please deactivate it instead.'
                );
            }

            // Step 3: Delete the material
            const deleteSQL = `
                DELETE FROM materials
                WHERE material_id = ?
            `;

            router.connection.execute(deleteSQL, [req.params.id], (err, result) => {

                if (err) {
                    console.error('Error deleting material:', err);

                    // Additional database foreign key protection
                    if (
                        err.code === 'ER_ROW_IS_REFERENCED_2' ||
                        err.code === 'ER_ROW_IS_REFERENCED'
                    ) {
                        return sendError(
                            res,
                            409,
                            'This material is referenced by other records. Please deactivate it instead.'
                        );
                    }

                    return sendError(res, 500, 'Unable to delete material.');
                }

                if (result.affectedRows === 0) {
                    return sendError(res, 404, 'Material not found.');
                }

                // Step 4: Empty response removes the row from the table
                res.send('');
            });
        }
    );
});

module.exports = router;