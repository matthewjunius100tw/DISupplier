
const express = require('express');
const { randomUUID } = require('node:crypto');

const router = express.Router();


const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// Helper: retrieve paginated material categories
function findCategories(query, callback) {

    const requestedSize = Number(query.page_size);

    const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize)
        ? requestedSize
        : DEFAULT_PAGE_SIZE;

    const requestedPage = Math.max(
        parseInt(query.page, 10) || 1,
        1
    );

    const countSQL = `
        SELECT COUNT(*) AS total
        FROM material_categories
    `;

    router.connection.query(countSQL, (err, countRows) => {

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

        const SQL = `
            SELECT
                mc.category_id,
                mc.category_name,
                mc.description,
                mc.is_active,
                COUNT(m.material_id) AS materials_count
            FROM material_categories mc
            LEFT JOIN materials m
                ON mc.category_id = m.category_id
            GROUP BY
                mc.category_id,
                mc.category_name,
                mc.description,
                mc.is_active
            ORDER BY mc.category_name, mc.category_id
            LIMIT ${pageSize} OFFSET ${offset}
        `;

        router.connection.query(SQL, (err, rows) => {

            if (err) {
                return callback(err);
            }

            rows.forEach(row => {
                row.materials_count = Number(row.materials_count);
            });

            // Display up to 5 consecutive pages
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
    });
}


// READ: Retrieve all material categories with material counts

// READ: Material Categories main page
router.get('/', (req, res) => {

    findCategories(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching material categories:', err);
            return res.status(500).send(
                'Unable to retrieve material categories.'
            );
        }

        res.render('material_categories/index', result);
    });
});

// READ: Paginated category results
router.get('/list', (req, res) => {

    findCategories(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching material categories:', err);
            return res.status(500).send(
                'Unable to retrieve material categories.'
            );
        }

        res.render('material_categories/results', result);
    });
});



// CREATE: Add a new material category
router.post('/', (req, res) => {

    const category_id = randomUUID();

    const category_name =
        typeof req.body.category_name === 'string'
            ? req.body.category_name.trim()
            : '';

    const description =
        typeof req.body.description === 'string'
            ? req.body.description.trim()
            : '';

    // Validate required input
    if (!category_name || category_name.length > 100) {
        return res.status(400).send(
            'Category name is required (maximum 100 characters).'
        );
    }

    const SQL = `
        INSERT INTO material_categories
            (category_id, category_name, description)
        VALUES (?, ?, ?)
    `;

    router.connection.execute(
        SQL,
        [category_id, category_name, description || null],
        (err) => {

            if (err) {
                console.error('Error adding material category:', err);

                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).send(
                        'This category name already exists.'
                    );
                }

                return res.status(500).send(
                    'Unable to add material category.'
                );
            }

            // Return the newly created table row
            res.set('HX-Trigger', 'category-added');
            res.render('material_categories/row', {
                category_id: category_id,
                category_name: category_name,
                description: description,
                materials_count: 0,
                is_active: 1
            });
        }
    );
});


// READ: Retrieve one category for editing or display
router.get('/:id/:view', (req, res) => {

    if (!['edit', 'row'].includes(req.params.view)) {
        return res.status(404).send('Page not found.');
    }

    const SQL = `
        SELECT
            mc.category_id,
            mc.category_name,
            mc.description,
            mc.is_active,
            COUNT(m.material_id) AS materials_count
        FROM material_categories mc
        LEFT JOIN materials m
            ON mc.category_id = m.category_id
        WHERE mc.category_id = ?
        GROUP BY
            mc.category_id,
            mc.category_name,
            mc.description,
            mc.is_active
    `;

    router.connection.execute(
        SQL,
        [req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error fetching category:', err);
                return res.status(500).send(
                    'Unable to retrieve category.'
                );
            }

            if (data.length === 0) {
                return res.status(404).send(
                    'Category not found.'
                );
            }

            res.render(
                'material_categories/' + req.params.view,
                data[0]
            );
        }
    );
});


// UPDATE: Edit material category name and description
router.put('/:id', (req, res) => {

    const category_name =
        typeof req.body.category_name === 'string'
            ? req.body.category_name.trim()
            : '';

    const description =
        typeof req.body.description === 'string'
            ? req.body.description.trim()
            : '';

    // Validate required input
    if (!category_name || category_name.length > 100) {
        return res.status(400).send(
            'Category name is required (max 100 characters).'
        );
    }

    const SQL = `
        UPDATE material_categories
        SET category_name = ?,
            description = ?
        WHERE category_id = ?
    `;

    router.connection.execute(
        SQL,
        [category_name, description || null, req.params.id],
        (err, result) => {

            if (err) {
                console.error('Error updating category:', err);

                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).send(
                        'Category name already exists.'
                    );
                }

                return res.status(500).send(
                    'Unable to update category.'
                );
            }

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    'Category not found.'
                );
            }

            // Retrieve the updated category with material count
            const selectSQL = `
                SELECT
                    mc.category_id,
                    mc.category_name,
                    mc.description,
                    mc.is_active,
                    COUNT(m.material_id) AS materials_count
                FROM material_categories mc
                LEFT JOIN materials m
                    ON mc.category_id = m.category_id
                WHERE mc.category_id = ?
                GROUP BY
                    mc.category_id,
                    mc.category_name,
                    mc.description,
                    mc.is_active
            `;

            router.connection.execute(
                selectSQL,
                [req.params.id],
                (err, data) => {

                    if (err || data.length === 0) {
                        return res.status(500).send(
                            'Unable to retrieve updated category.'
                        );
                    }

                    res.render('material_categories/row', data[0]);
                }
            );
        }
    );
});


// UPDATE: Toggle material category Active/Inactive status
router.put('/:id/status', (req, res) => {

    const SQL = `
        UPDATE material_categories
        SET is_active = NOT is_active
        WHERE category_id = ?
    `;

    router.connection.execute(
        SQL,
        [req.params.id],
        (err, result) => {

            if (err) {
                console.error('Error updating category status:', err);
                return res.status(500).send(
                    'Unable to update category status.'
                );
            }

            if (result.affectedRows === 0) {
                return res.status(404).send(
                    'Category not found.'
                );
            }

            // Retrieve updated category with material count
            const selectSQL = `
                SELECT
                    mc.category_id,
                    mc.category_name,
                    mc.description,
                    mc.is_active,
                    COUNT(m.material_id) AS materials_count
                FROM material_categories mc
                LEFT JOIN materials m
                    ON mc.category_id = m.category_id
                WHERE mc.category_id = ?
                GROUP BY
                    mc.category_id,
                    mc.category_name,
                    mc.description,
                    mc.is_active
            `;

            router.connection.execute(
                selectSQL,
                [req.params.id],
                (err, data) => {

                    if (err || data.length === 0) {
                        return res.status(500).send(
                            'Unable to retrieve category.'
                        );
                    }

                    res.render('material_categories/row', data[0]);
                }
            );
        }
    );
});



// DELETE: Only remove categories without related materials
router.delete('/:id', (req, res) => {

    // Step 1: Check how many materials use this category
    const checkSQL = `
        SELECT COUNT(*) AS materials_count
        FROM materials
        WHERE category_id = ?
    `;

    router.connection.execute(
        checkSQL,
        [req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error checking category relationships:', err);
                res.set('HX-Reswap', 'none');
                return res.status(500).send(
                    'Unable to check category relationships.'
                );
            }

            const materialsCount = Number(data[0].materials_count);

            // Step 2: Reject deletion if the category is in use
            if (materialsCount > 0) {
                res.set('HX-Reswap', 'none');

                return res.status(409).send(
                    'This category contains ' + materialsCount +
                    ' materials. Please deactivate it instead.'
                );
            }

            // Step 3: Delete the category if it has no materials
            const deleteSQL = `
                DELETE FROM material_categories
                WHERE category_id = ?
            `;

            router.connection.execute(
                deleteSQL,
                [req.params.id],
                (err, result) => {

                    if (err) {
                        console.error('Error deleting category:', err);
                        res.set('HX-Reswap', 'none');

                        // Additional database foreign key protection
                        if (
                            err.code === 'ER_ROW_IS_REFERENCED_2' ||
                            err.code === 'ER_ROW_IS_REFERENCED'
                        ) {
                            return res.status(409).send(
                                'This category is referenced by other records. ' +
                                'Please deactivate it instead.'
                            );
                        }

                        return res.status(500).send(
                            'Unable to delete material category.'
                        );
                    }

                    if (result.affectedRows === 0) {
                        res.set('HX-Reswap', 'none');
                        return res.status(404).send(
                            'Category not found.'
                        );
                    }

                    // Step 4: Remove the category row from the UI
                    res.set('HX-Trigger', 'category-deleted');
                    res.send('');

                }
            );
        }
    );
});

module.exports = router;
