
const express = require('express');
const { randomInt } = require('node:crypto');

const router = express.Router();

// Supplier pagination settings
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// Shared SELECT: supplier details and relationship counts
const SELECT_SUPPLIERS = `
    SELECT
        s.supplier_id,
        s.supplier_name,
        s.email,
        s.phone,
        s.address,
        s.website,
        s.is_active,
        s.created_at,
        s.updated_at,
        (SELECT COUNT(*) FROM supplier_materials sm
            WHERE sm.supplier_id = s.supplier_id) AS material_count,
        (SELECT COUNT(*) FROM purchase_orders po
            WHERE po.supplier_id = s.supplier_id) AS order_count
    FROM suppliers s
`;

// Helper: display an error message above the supplier table
function sendError(res, status, message) {
    res.set('HX-Retarget', '#supplier-message');
    res.set('HX-Reswap', 'innerHTML');

    return res.status(status).send(`
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>
            ${message}
            <button type="button" class="btn-close"
                data-bs-dismiss="alert"></button>
        </div>
    `);
}

// Helper: retrieve suppliers and calculate usage counts
function querySuppliers(extraSQL, params, callback) {
    router.connection.execute(
        SELECT_SUPPLIERS + extraSQL,
        params,
        (err, rows) => {
            if (err) {
                return callback(err);
            }

            rows.forEach((row) => {
                row.material_count = Number(row.material_count);
                row.order_count = Number(row.order_count);
                row.usage_count =
                    row.material_count + row.order_count;
            });

            callback(null, rows);
        }
    );
}

// Helper: search and paginate suppliers
function findSuppliers(query, callback) {

    const keyword =
        typeof query.q === 'string' ? query.q.trim() : '';

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

    // Keyword search by supplier name or supplier ID
    if (keyword) {
        conditions.push(
            '(s.supplier_name LIKE ? OR s.supplier_id LIKE ?)'
        );

        params.push('%' + keyword + '%', '%' + keyword + '%');
    }

    const whereSQL = conditions.length > 0
        ? ' WHERE ' + conditions.join(' AND ')
        : '';

    // Count suppliers matching the current search
    const countSQL = `
        SELECT COUNT(*) AS total
        FROM suppliers s
        ${whereSQL}
    `;

    router.connection.execute(countSQL, params, (err, countRows) => {

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

        const extraSQL =
            whereSQL +
            ' ORDER BY s.supplier_name, s.supplier_id' +
            ' LIMIT ' + pageSize +
            ' OFFSET ' + offset;

        querySuppliers(extraSQL, params, (err, rows) => {

            if (err) {
                return callback(err);
            }

            // Compact pagination with ellipses
            const pageNumbers = new Set([
                1,
                totalPages,
                page - 1,
                page,
                page + 1
            ]);

            const visiblePages = [...pageNumbers]
                .filter(n => n >= 1 && n <= totalPages)
                .sort((a, b) => a - b);

            const pages = [];

            visiblePages.forEach((number, index) => {

                if (index > 0) {
                    const gap = number - visiblePages[index - 1];

                    if (gap === 2) {
                        pages.push({
                            number: number - 1,
                            active: false
                        });
                    } else if (gap > 2) {
                        pages.push({
                            ellipsis: true
                        });
                    }
                }

                pages.push({
                    number: number,
                    active: number === page
                });
            });

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
                startRecord: total === 0 ? 0 : offset + 1,
                endRecord: Math.min(offset + pageSize, total)
            });
        });
    });
}

// Helper: render a supplier row
function renderRow(res, supplier_id) {

    querySuppliers(
        ' WHERE s.supplier_id = ?',
        [supplier_id],
        (err, data) => {

            if (err) {
                console.error('Error fetching supplier:', err);
                return sendError(
                    res, 500, 'Unable to retrieve supplier.'
                );
            }

            if (data.length === 0) {
                return sendError(res, 404, 'Supplier not found.');
            }

            res.render('suppliers/row', data[0]);
        }
    );
}

// Helper: read supplier form fields
function readSupplierForm(body) {

    const text = (value) =>
        typeof value === 'string' ? value.trim() : '';

    return {
        supplier_name: text(body.supplier_name),
        email: text(body.email),
        phone: text(body.phone),
        address: text(body.address),
        website: text(body.website)
    };
}

// Helper: validate supplier information
function validateSupplier(supplier) {

    if (!supplier.supplier_name ||
        supplier.supplier_name.length > 150) {
        return 'Supplier name is required (maximum 150 characters).';
    }

    if (!supplier.email || supplier.email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
        return 'Please enter a valid email address (maximum 255 characters).';
    }

    if (!supplier.phone || supplier.phone.length > 30) {
        return 'Phone number is required (maximum 30 characters).';
    }

    if (!supplier.address) {
        return 'Supplier address is required.';
    }

    if (supplier.website) {
        if (supplier.website.length > 255) {
            return 'Website must not exceed 255 characters.';
        }

        try {
            const url = new URL(supplier.website);

            if (!['http:', 'https:'].includes(url.protocol) ||
                !url.hostname.includes('.')) {
                return 'Please enter a valid website URL.';
            }
        } catch {
            return 'Please enter a valid website URL, including https://.';
        }
    }

    return null;
}

// READ: Supplier Management main page
router.get('/', (req, res) => {

    findSuppliers(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching suppliers:', err);
            return res.status(500).send(
                'Unable to retrieve suppliers.'
            );
        }

        res.render('suppliers/index', result);
    });
});

// READ: Supplier list for search and pagination
router.get('/list', (req, res) => {

    findSuppliers(req.query, (err, result) => {

        if (err) {
            console.error('Error fetching suppliers:', err);
            return sendError(
                res, 500, 'Unable to retrieve suppliers.'
            );
        }

        res.render('suppliers/results', result);
    });
});

// CREATE: Add new supplier
router.post('/', (req, res) => {

    const supplier = readSupplierForm(req.body);

    const error = validateSupplier(supplier);

    if (error) {
        return sendError(res, 400, error);
    }

    const SQL = `
        INSERT INTO suppliers
            (supplier_id, supplier_name, email,
             phone, address, website)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    // Retry if a randomly generated supplier ID already exists
    function insertSupplier(attempt) {

        const supplier_id = String(
            randomInt(0, 100000000)
        ).padStart(8, '0');

        router.connection.execute(
            SQL,
            [
                supplier_id,
                supplier.supplier_name,
                supplier.email,
                supplier.phone,
                supplier.address,
                supplier.website || null
            ],
            (err) => {

                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        if (attempt < 5) {
                            return insertSupplier(attempt + 1);
                        }

                        return sendError(
                            res, 409,
                            'Unable to generate a unique supplier ID. Please try again.'
                        );
                    }

                    console.error('Error adding supplier:', err);

                    return sendError(
                        res, 500, 'Unable to add supplier.'
                    );
                }

                renderRow(res, supplier_id);
            }
        );
    }

    insertSupplier(1);
});

// READ: One supplier as an edit form or normal row
router.get('/:id/:view', (req, res) => {

    if (req.params.view === 'row') {
        return renderRow(res, req.params.id);
    }

    if (req.params.view !== 'edit') {
        return res.status(404).send('Page not found.');
    }

    querySuppliers(
        ' WHERE s.supplier_id = ?',
        [req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error fetching supplier:', err);
                return sendError(
                    res, 500, 'Unable to retrieve supplier.'
                );
            }

            if (data.length === 0) {
                return sendError(res, 404, 'Supplier not found.');
            }

            res.render('suppliers/edit', data[0]);
        }
    );
});

// UPDATE: Edit supplier information
router.put('/:id', (req, res) => {

    const supplier = readSupplierForm(req.body);

    const error = validateSupplier(supplier);

    if (error) {
        return sendError(res, 400, error);
    }

    const SQL = `
        UPDATE suppliers
        SET supplier_name = ?,
            email = ?,
            phone = ?,
            address = ?,
            website = ?
        WHERE supplier_id = ?
    `;

    router.connection.execute(
        SQL,
        [
            supplier.supplier_name,
            supplier.email,
            supplier.phone,
            supplier.address,
            supplier.website || null,
            req.params.id
        ],
        (err, result) => {

            if (err) {
                console.error('Error updating supplier:', err);

                return sendError(
                    res, 500, 'Unable to update supplier.'
                );
            }

            if (result.affectedRows === 0) {
                return sendError(res, 404, 'Supplier not found.');
            }

            renderRow(res, req.params.id);
        }
    );
});

// UPDATE: Toggle supplier Active/Inactive status
router.put('/:id/status', (req, res) => {

    const SQL = `
        UPDATE suppliers
        SET is_active = NOT is_active
        WHERE supplier_id = ?
    `;

    router.connection.execute(
        SQL,
        [req.params.id],
        (err, result) => {

            if (err) {
                console.error('Error updating supplier status:', err);

                return sendError(
                    res, 500, 'Unable to update supplier status.'
                );
            }

            if (result.affectedRows === 0) {
                return sendError(res, 404, 'Supplier not found.');
            }

            renderRow(res, req.params.id);
        }
    );
});

// DELETE: Only suppliers without related records can be removed
router.delete('/:id', (req, res) => {

    const checkSQL = `
        SELECT
            (SELECT COUNT(*) FROM supplier_materials
                WHERE supplier_id = ?)
            +
            (SELECT COUNT(*) FROM purchase_orders
                WHERE supplier_id = ?)
            AS usage_count
    `;

    router.connection.execute(
        checkSQL,
        [req.params.id, req.params.id],
        (err, data) => {

            if (err) {
                console.error('Error checking supplier relationships:', err);

                return sendError(
                    res, 500,
                    'Unable to check supplier relationships.'
                );
            }

            const usageCount = Number(data[0].usage_count);

            if (usageCount > 0) {
                return sendError(
                    res,
                    409,
                    'This supplier has ' + usageCount +
                    ' related material/order records. Please deactivate it instead.'
                );
            }

            const deleteSQL = `
                DELETE FROM suppliers
                WHERE supplier_id = ?
            `;

            router.connection.execute(
                deleteSQL,
                [req.params.id],
                (err, result) => {

                    if (err) {
                        console.error('Error deleting supplier:', err);

                        if (
                            err.code === 'ER_ROW_IS_REFERENCED_2' ||
                            err.code === 'ER_ROW_IS_REFERENCED'
                        ) {
                            return sendError(
                                res,
                                409,
                                'This supplier is referenced by other records. Please deactivate it instead.'
                            );
                        }

                        return sendError(
                            res, 500, 'Unable to delete supplier.'
                        );
                    }

                    if (result.affectedRows === 0) {
                        return sendError(
                            res, 404, 'Supplier not found.'
                        );
                    }

                    // Notify HTMX to refresh supplier results after deletion
                    res.set('HX-Trigger', 'supplier-deleted');
                    res.send('');
                }
            );
        }
    );
});

module.exports = router;