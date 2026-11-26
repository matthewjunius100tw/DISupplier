const express = require("express");
const router = express.Router();

// Marketplace Main Page
router.get("/", (req, res) => {
  const sql = `
        SELECT
            COUNT(DISTINCT sm.material_id) AS total_materials,
            COUNT(DISTINCT sm.supplier_id) AS total_suppliers,
            COUNT(*) AS total_listings,
            SUM(
                CASE
                    WHEN sm.is_available = 1
                    AND sm.available_quantity > 0
                    AND sm.unit_price IS NOT NULL
                    THEN 1
                    ELSE 0
                END
            ) AS available_listings
        FROM supplier_materials sm
        INNER JOIN materials m
            ON sm.material_id = m.material_id
        INNER JOIN suppliers s
            ON sm.supplier_id = s.supplier_id
        WHERE m.is_active = 1
          AND s.is_active = 1
    `;

  router.connection.query(sql, (err, results) => {
    if (err) {
      console.error("Marketplace error:", err);

      return res.status(500).send("Failed to load Marketplace.");
    }

    const data = results[0];

    const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

    const stats = {
      total_materials: formatNumber(data.total_materials),

      total_suppliers: formatNumber(data.total_suppliers),

      total_listings: formatNumber(data.total_listings),

      available_listings: formatNumber(data.available_listings),
    };

    res.render("marketplace/index", {
      stats: stats,
    });
  });
});

/* ==========================================
   PHASE M2 — MARKETPLACE BROWSE MATERIALS
========================================== */

// Reuse the database connection assigned in app.js.
function marketplaceQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    router.connection.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Format decimal values without unnecessary zeros.
function formatQuantity(value) {
  if (value === null || value === undefined) return "N/A";

  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 3,
  });
}

// Format prices with two decimal places.
function formatPrice(value) {
  if (value === null || value === undefined) return "N/A";

  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Build pagination URLs without changing other filters.
function buildMarketplaceUrl(base, params) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });

  return base + (query.toString() ? "?" + query.toString() : "");
}

// Five-page sliding window.
function buildMarketplacePagination(page, totalPages, urlBuilder) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));

  const end = Math.min(totalPages, start + 4);

  const pages = [];

  for (let i = start; i <= end; i++) {
    pages.push({
      number: i,
      url: urlBuilder(i),
      active: i === page,
    });
  }

  return {
    pages,
    firstUrl: urlBuilder(1),
    previousUrl: urlBuilder(Math.max(1, page - 1)),
    nextUrl: urlBuilder(Math.min(totalPages, page + 1)),
    lastUrl: urlBuilder(totalPages),
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

// Validate page sizes.
function getMarketplacePageSize(value) {
  const size = Number(value);
  return [25, 50, 100].includes(size) ? size : 25;
}

/* ==========================================
   M2A — BROWSE MATERIALS
   GET /marketplace/materials
========================================== */

router.get("/materials", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 150);

    const categoryId = String(req.query.category || "")
      .trim()
      .slice(0, 36);

    const sort = ["name", "price", "suppliers"].includes(req.query.sort)
      ? req.query.sort
      : "name";

    const pageSize = getMarketplacePageSize(req.query.pageSize);

    const requestedPage = parseInt(req.query.page, 10);
    const inputPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    // Filter active materials and active suppliers.
    // Only eligible supplier listings are displayed.
    const conditions = [
      "m.is_active = 1",
      "s.is_active = 1",
      "sm.is_available = 1",
      "sm.available_quantity > 0",
      "sm.unit_price IS NOT NULL",
    ];

    const params = [];

    if (search) {
      conditions.push("(m.material_name LIKE ? OR m.material_id LIKE ?)");

      params.push(`%${search}%`, `%${search}%`);
    }

    if (categoryId) {
      conditions.push("m.category_id = ?");
      params.push(categoryId);
    }

    const whereClause = conditions.join(" AND ");

    // Group by material because multiple suppliers
    // may sell the same material.
    const materialBaseQuery = `
            FROM materials m
            INNER JOIN supplier_materials sm
                ON sm.material_id = m.material_id
            INNER JOIN suppliers s
                ON sm.supplier_id = s.supplier_id
            INNER JOIN material_categories mc
                ON m.category_id = mc.category_id
            WHERE ${whereClause}
            GROUP BY
                m.material_id,
                m.material_name,
                m.specification,
                m.unit,
                mc.category_name
        `;

    // Count unique materials, not supplier-material rows.
    const countQuery = `
            SELECT COUNT(*) AS total
            FROM (
                SELECT m.material_id
                FROM materials m
                INNER JOIN supplier_materials sm
                    ON sm.material_id = m.material_id
                INNER JOIN suppliers s
                    ON sm.supplier_id = s.supplier_id
                WHERE ${whereClause}
                GROUP BY m.material_id
            ) AS grouped_materials
        `;

    const countResult = await marketplaceQuery(countQuery, params);

    const totalRecords = Number(countResult[0].total);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    const page = Math.min(inputPage, totalPages);
    const offset = (page - 1) * pageSize;

    const sortClauses = {
      name: "m.material_name ASC, m.material_id ASC",
      price: "starting_price ASC, m.material_name ASC",
      suppliers: "supplier_count DESC, m.material_name ASC",
    };

    const materialsQuery = `
            SELECT
                m.material_id,
                m.material_name,
                m.specification,
                m.unit,
                mc.category_name,
                COUNT(DISTINCT sm.supplier_id) AS supplier_count,
                MIN(sm.unit_price) AS starting_price
            ${materialBaseQuery}
            ORDER BY ${sortClauses[sort]}
            LIMIT ? OFFSET ?
        `;

    const materials = await marketplaceQuery(materialsQuery, [
      ...params,
      pageSize,
      offset,
    ]);

    const categoryQuery = `
            SELECT category_id, category_name
            FROM material_categories
            ORDER BY category_name ASC
        `;

    const categories = await marketplaceQuery(categoryQuery);

    const filterParams = {
      search,
      category: categoryId,
      sort,
      pageSize,
    };

    const baseUrl = "/marketplace/materials";

    const urlBuilder = (pageNumber) =>
      buildMarketplaceUrl(baseUrl, {
        ...filterParams,
        page: pageNumber,
      });

    const pagination = buildMarketplacePagination(page, totalPages, urlBuilder);

    const formattedMaterials = materials.map((m) => ({
      ...m,
      starting_price_display: formatPrice(m.starting_price),
      supplier_count_display: Number(m.supplier_count).toLocaleString("en-US"),
      specification_display: m.specification || "No specification provided",
    }));

    const formattedCategories = categories.map((c) => ({
      ...c,
      selected: c.category_id === categoryId,
    }));

    const pageSizes = [25, 50, 100].map((size) => ({
      value: size,
      selected: size === pageSize,
    }));

    const sortOptions = [
      { value: "name", label: "Material Name" },
      { value: "price", label: "Lowest Starting Price" },
      { value: "suppliers", label: "Most Suppliers" },
    ].map((option) => ({
      ...option,
      selected: option.value === sort,
    }));

    res.render("marketplace/materials", {
      materials: formattedMaterials,
      categories: formattedCategories,
      pageSizes,
      sortOptions,

      search,
      categoryId,
      sort,
      pageSize,

      totalRecords,
      totalRecordsDisplay: totalRecords.toLocaleString("en-US"),
      totalPages,
      currentPage: page,

      startRecord: totalRecords === 0 ? 0 : offset + 1,
      endRecord: Math.min(offset + pageSize, totalRecords),

      hasMaterials: totalRecords > 0,

      ...pagination,
    });
  } catch (error) {
    console.error("Marketplace Browse Materials Error:", error);

    res
      .status(500)
      .send(
        '<div class="alert alert-danger">' +
        "Failed to load Marketplace materials." +
        "</div>",
      );
  }
});

/* ==========================================
   M2B — MATERIAL SUPPLIER COMPARISON
   GET /marketplace/materials/:material_id
========================================== */

router.get("/materials/:material_id", async (req, res) => {
  try {
    const materialId = req.params.material_id;

    // Optional navigation context from Supplier Storefront.
    const fromSupplier = String(
      req.query.fromSupplier || ''
    ).trim();

    const sort = [
      "price_asc",
      "price_desc",
      "quantity_desc",
      "supplier",
    ].includes(req.query.sort)
      ? req.query.sort
      : "price_asc";

    const pageSize = getMarketplacePageSize(req.query.pageSize);

    const requestedPage = parseInt(req.query.page, 10);
    const inputPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    // Find the selected material.
    const materialQuery = `
            SELECT
                m.material_id,
                m.material_name,
                m.specification,
                m.unit,
                mc.category_name
            FROM materials m
            INNER JOIN material_categories mc
                ON m.category_id = mc.category_id
            WHERE m.material_id = ?
              AND m.is_active = 1
            LIMIT 1
        `;

    const materialResults = await marketplaceQuery(materialQuery, [materialId]);

    if (materialResults.length === 0) {
      return res
        .status(404)
        .send(
          '<div class="alert alert-warning">' +
          "Material not found or inactive." +
          "</div>",
        );
    }

    const material = materialResults[0];

    // Default navigation: return to Browse Materials.
    let backUrl = '/marketplace/materials';
    let backLabel = 'Back to Materials';
    let backToStorefront = false;

    // If opened from a Supplier Storefront,
    // validate the supplier-material relationship.
    if (fromSupplier) {

      const sourceQuery = `
        SELECT s.supplier_id
        FROM suppliers s
        INNER JOIN supplier_materials sm
            ON s.supplier_id = sm.supplier_id
        WHERE s.supplier_id = ?
          AND sm.material_id = ?
          AND s.is_active = 1
        LIMIT 1
    `;

      const sourceResults = await marketplaceQuery(
        sourceQuery,
        [fromSupplier, materialId]
      );

      if (sourceResults.length > 0) {

        backUrl =
          '/marketplace/suppliers/' +
          encodeURIComponent(fromSupplier);

        backLabel = 'Back to Supplier Storefront';
        backToStorefront = true;
      }
    }

    // Count active suppliers offering this material.
    const countQuery = `
            SELECT COUNT(*) AS total
            FROM supplier_materials sm
            INNER JOIN suppliers s
                ON sm.supplier_id = s.supplier_id
            WHERE sm.material_id = ?
              AND s.is_active = 1
        `;

    const countResult = await marketplaceQuery(countQuery, [materialId]);

    const totalRecords = Number(countResult[0].total);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    const page = Math.min(inputPage, totalPages);
    const offset = (page - 1) * pageSize;

    const sortClauses = {
      price_asc: `
                CASE WHEN sm.unit_price IS NULL THEN 1 ELSE 0 END ASC,
                sm.unit_price ASC,
                s.supplier_name ASC
            `,
      price_desc: `
                CASE WHEN sm.unit_price IS NULL THEN 1 ELSE 0 END ASC,
                sm.unit_price DESC,
                s.supplier_name ASC
            `,
      quantity_desc: `
                CASE WHEN sm.available_quantity IS NULL
                THEN 1 ELSE 0 END ASC,
                sm.available_quantity DESC,
                s.supplier_name ASC
            `,
      supplier: "s.supplier_name ASC",
    };

    const suppliersQuery = `
            SELECT
                sm.supplier_material_id,
                sm.supplier_id,
                sm.unit_price,
                sm.available_quantity,
                sm.is_available,
                s.supplier_name,
                s.email,
                s.phone,
                s.address,
                s.website
            FROM supplier_materials sm
            INNER JOIN suppliers s
                ON sm.supplier_id = s.supplier_id
            WHERE sm.material_id = ?
              AND s.is_active = 1
            ORDER BY ${sortClauses[sort]},
                     sm.supplier_material_id ASC
            LIMIT ? OFFSET ?
        `;

    const suppliers = await marketplaceQuery(suppliersQuery, [
      materialId,
      pageSize,
      offset,
    ]);

    // Determine lowest current eligible supplier price.
    const priceSummaryQuery = `
            SELECT
                MIN(sm.unit_price) AS lowest_price,
                COUNT(*) AS available_suppliers
            FROM supplier_materials sm
            INNER JOIN suppliers s
                ON sm.supplier_id = s.supplier_id
            WHERE sm.material_id = ?
              AND s.is_active = 1
              AND sm.is_available = 1
              AND sm.available_quantity > 0
              AND sm.unit_price IS NOT NULL
        `;

    const priceSummaryResults = await marketplaceQuery(priceSummaryQuery, [
      materialId,
    ]);

    const summary = priceSummaryResults[0];

    const formattedSuppliers = suppliers.map((s) => {
      const isAvailable =
        Number(s.is_available) === 1 &&
        Number(s.available_quantity) > 0 &&
        s.unit_price !== null;

      let statusLabel = "Unavailable";
      let statusClass = "bg-secondary";

      if (isAvailable) {
        statusLabel = "Available";
        statusClass = "bg-success";
      } else if (
        Number(s.is_available) === 1 &&
        Number(s.available_quantity) === 0
      ) {
        statusLabel = "Out of Stock";
        statusClass = "bg-warning text-dark";
      } else if (s.is_available === null || s.available_quantity === null) {
        statusLabel = "Unconfirmed";
        statusClass = "bg-secondary";
      }

      return {
        ...s,
        unit_price_display: formatPrice(s.unit_price),
        quantity_display: formatQuantity(s.available_quantity),
        statusLabel,
        statusClass,
        isAvailable,
      };
    });

    const baseUrl = "/marketplace/materials/" + encodeURIComponent(materialId);

    const urlBuilder = (pageNumber) =>
      buildMarketplaceUrl(baseUrl, {
        sort,
        pageSize,
        page: pageNumber,
        fromSupplier: backToStorefront
          ? fromSupplier
          : ''
      });

    const pagination = buildMarketplacePagination(page, totalPages, urlBuilder);

    const sortOptions = [
      { value: "price_asc", label: "Lowest Price" },
      { value: "price_desc", label: "Highest Price" },
      { value: "quantity_desc", label: "Highest Stock" },
      { value: "supplier", label: "Supplier Name" },
    ].map((option) => ({
      ...option,
      selected: option.value === sort,
    }));

    const pageSizes = [25, 50, 100].map((size) => ({
      value: size,
      selected: size === pageSize,
    }));

    res.render("marketplace/material-details", {
      backUrl,
      backLabel,
      backToStorefront,
      fromSupplier: backToStorefront ? fromSupplier : '',

      material: {
        ...material,
        specification_display:
          material.specification || "No specification provided",
      },

      suppliers: formattedSuppliers,

      sortOptions,
      pageSizes,
      sort,
      pageSize,

      totalRecords,
      totalRecordsDisplay: totalRecords.toLocaleString("en-US"),

      availableSuppliersDisplay: Number(
        summary.available_suppliers,
      ).toLocaleString("en-US"),

      lowestPriceDisplay: formatPrice(summary.lowest_price),

      currentPage: page,
      totalPages,

      startRecord: totalRecords === 0 ? 0 : offset + 1,
      endRecord: Math.min(offset + pageSize, totalRecords),

      hasSuppliers: totalRecords > 0,

      ...pagination,
    });
  } catch (error) {
    console.error("Marketplace Comparison Error:", error);

    res
      .status(500)
      .send(
        '<div class="alert alert-danger">' +
        "Failed to load supplier comparison." +
        "</div>",
      );
  }
});

/* ==========================================
   PHASE M3 — BROWSE SUPPLIERS
========================================== */

/* ==========================================
   M3A — SUPPLIER DIRECTORY
   GET /marketplace/suppliers
========================================== */

router.get("/suppliers", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 150);

    const sort = ["name", "materials"].includes(req.query.sort)
      ? req.query.sort
      : "name";

    const pageSize = getMarketplacePageSize(req.query.pageSize);

    const requestedPage = Number(req.query.page);

    const inputPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    // Only show active suppliers.
    const conditions = ["s.is_active = 1"];
    const params = [];

    if (search) {
      conditions.push(`
                (
                    s.supplier_name LIKE ?
                    OR s.supplier_id LIKE ?
                )
            `);

      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    // Count suppliers with at least one active
    // material listing.
    const countQuery = `
            SELECT COUNT(*) AS total
            FROM suppliers s
            WHERE ${whereClause}
              AND EXISTS (
                  SELECT 1
                  FROM supplier_materials sm
                  INNER JOIN materials m
                      ON sm.material_id = m.material_id
                  WHERE sm.supplier_id = s.supplier_id
                    AND m.is_active = 1
              )
        `;

    const countResult = await marketplaceQuery(countQuery, params);

    const totalRecords = Number(countResult[0].total);

    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    const page = Math.min(inputPage, totalPages);

    const offset = (page - 1) * pageSize;

    // Whitelisted sorting only.
    const sortClauses = {
      name: `
        s.supplier_name ASC,
        s.supplier_id ASC
    `,
      materials: `
        total_materials DESC,
        s.supplier_name ASC
    `,
    };

    // Aggregate material listings per supplier.
    // A supplier appears only once.
    const suppliersQuery = `
            SELECT
                s.supplier_id,
                s.supplier_name,
                s.address,
                s.website,

                COUNT(DISTINCT sm.material_id)
                    AS total_materials,

                COUNT(DISTINCT CASE
                    WHEN sm.is_available = 1
                         AND sm.available_quantity > 0
                         AND sm.unit_price IS NOT NULL
                    THEN sm.material_id
                    ELSE NULL
                END) AS available_materials

            FROM suppliers s

            INNER JOIN supplier_materials sm
                ON s.supplier_id = sm.supplier_id

            INNER JOIN materials m
                ON sm.material_id = m.material_id

            WHERE ${whereClause}
              AND m.is_active = 1

            GROUP BY
                s.supplier_id,
                s.supplier_name,
                s.address,
                s.website

            ORDER BY ${sortClauses[sort]}

            LIMIT ? OFFSET ?
        `;

    const suppliers = await marketplaceQuery(suppliersQuery, [
      ...params,
      pageSize,
      offset,
    ]);

    const formattedSuppliers = suppliers.map((s) => ({
      ...s,

      total_materials_display: Number(s.total_materials).toLocaleString(
        "en-US",
      ),

      available_materials_display: Number(s.available_materials).toLocaleString(
        "en-US",
      ),

      address_display: s.address || "Address not provided",
    }));

    const sortOptions = [
      {
        value: "name",
        label: "Supplier Name",
      },
      {
        value: "materials",
        label: "Most Materials",
      },
    ].map((option) => ({
      ...option,
      selected: option.value === sort,
    }));

    const pageSizes = [25, 50, 100].map((size) => ({
      value: size,
      selected: size === pageSize,
    }));

    const baseUrl = "/marketplace/suppliers";

    const urlBuilder = (pageNumber) =>
      buildMarketplaceUrl(baseUrl, {
        search,
        sort,
        pageSize,
        page: pageNumber,
      });

    const pagination = buildMarketplacePagination(page, totalPages, urlBuilder);

    res.render("marketplace/suppliers", {
      suppliers: formattedSuppliers,

      search,
      sort,
      pageSize,

      sortOptions,
      pageSizes,

      totalRecords,
      totalRecordsDisplay: totalRecords.toLocaleString("en-US"),

      currentPage: page,
      totalPages,

      startRecord: totalRecords === 0 ? 0 : offset + 1,

      endRecord: Math.min(offset + pageSize, totalRecords),

      hasSuppliers: totalRecords > 0,

      ...pagination,
    });
  } catch (error) {
    console.error("Marketplace Browse Suppliers Error:", error);

    res
      .status(500)
      .send(
        '<div class="alert alert-danger">' +
        "Failed to load Marketplace suppliers." +
        "</div>",
      );
  }
});

/* ==========================================
   M3B — SUPPLIER STOREFRONT
   GET /marketplace/suppliers/:supplier_id
========================================== */

router.get("/suppliers/:supplier_id", async (req, res) => {
  try {
    const supplierId = req.params.supplier_id;

    const search = String(req.query.search || "")
      .trim()
      .slice(0, 150);

    const categoryId = String(req.query.category || "")
      .trim()
      .slice(0, 36);

    const sort = ["name", "price_asc", "price_desc", "quantity_desc"].includes(
      req.query.sort,
    )
      ? req.query.sort
      : "name";

    const pageSize = getMarketplacePageSize(req.query.pageSize);

    const requestedPage = Number(req.query.page);

    const inputPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    // Retrieve selected supplier.
    // Never retrieve or display supplier passwords.
    const supplierQuery = `
            SELECT
                supplier_id,
                supplier_name,
                email,
                phone,
                address,
                website
            FROM suppliers
            WHERE supplier_id = ?
              AND is_active = 1
            LIMIT 1
        `;

    const supplierResults = await marketplaceQuery(supplierQuery, [supplierId]);

    if (supplierResults.length === 0) {
      return res
        .status(404)
        .send(
          '<div class="alert alert-warning">' +
          "Supplier not found or inactive." +
          "</div>",
        );
    }

    const supplier = supplierResults[0];

    // Retrieve only categories containing materials
    // offered by the selected supplier.
    const categoryQuery = `
    SELECT DISTINCT
        mc.category_id,
        mc.category_name
    FROM supplier_materials sm
    INNER JOIN materials m
        ON sm.material_id = m.material_id
    INNER JOIN material_categories mc
        ON m.category_id = mc.category_id
    WHERE sm.supplier_id = ?
      AND m.is_active = 1
    ORDER BY mc.category_name ASC
`;

    const categoryResults = await marketplaceQuery(categoryQuery, [supplierId]);

    const categories = categoryResults.map((c) => ({
      ...c,
      selected: c.category_id === categoryId,
    }));

    // Material filter.
    const conditions = ["sm.supplier_id = ?", "m.is_active = 1"];

    const params = [supplierId];

    if (search) {
      conditions.push(`
                (
                    m.material_name LIKE ?
                    OR m.material_id LIKE ?
                    OR mc.category_name LIKE ?
                )
            `);

      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Filter materials by the selected category.
    if (categoryId) {
      conditions.push("m.category_id = ?");
      params.push(categoryId);
    }

    const whereClause = conditions.join(" AND ");

    // Count materials matching current search.
    const countQuery = `
            SELECT COUNT(*) AS total

            FROM supplier_materials sm

            INNER JOIN materials m
                ON sm.material_id = m.material_id

            INNER JOIN material_categories mc
                ON m.category_id = mc.category_id

            WHERE ${whereClause}
        `;

    const countResult = await marketplaceQuery(countQuery, params);

    const totalRecords = Number(countResult[0].total);

    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    const page = Math.min(inputPage, totalPages);

    const offset = (page - 1) * pageSize;

    // Whitelisted sorting.
    const sortClauses = {
      name: `
                m.material_name ASC,
                m.material_id ASC
            `,
      price_asc: `
                CASE
                    WHEN sm.unit_price IS NULL
                    THEN 1 ELSE 0
                END ASC,
                sm.unit_price ASC,
                m.material_name ASC
            `,
      price_desc: `
                CASE
                    WHEN sm.unit_price IS NULL
                    THEN 1 ELSE 0
                END ASC,
                sm.unit_price DESC,
                m.material_name ASC
            `,
      quantity_desc: `
                CASE
                    WHEN sm.available_quantity IS NULL
                    THEN 1 ELSE 0
                END ASC,
                sm.available_quantity DESC,
                m.material_name ASC
            `,
    };

    // Get supplier-specific material listings.
    const materialsQuery = `
            SELECT
                sm.supplier_material_id,
                sm.material_id,
                sm.unit_price,
                sm.available_quantity,
                sm.is_available,

                m.material_name,
                m.specification,
                m.unit,

                mc.category_name

            FROM supplier_materials sm

            INNER JOIN materials m
                ON sm.material_id = m.material_id

            INNER JOIN material_categories mc
                ON m.category_id = mc.category_id

            WHERE ${whereClause}

            ORDER BY ${sortClauses[sort]}

            LIMIT ? OFFSET ?
        `;

    const materials = await marketplaceQuery(materialsQuery, [
      ...params,
      pageSize,
      offset,
    ]);

    // Storefront summary for all active materials,
    // independent of the current search filter.
    const summaryQuery = `
            SELECT
                COUNT(*) AS total_materials,

                SUM(
                    CASE
                        WHEN sm.is_available = 1
                         AND sm.available_quantity > 0
                         AND sm.unit_price IS NOT NULL
                        THEN 1 ELSE 0
                    END
                ) AS available_materials

            FROM supplier_materials sm

            INNER JOIN materials m
                ON sm.material_id = m.material_id

            WHERE sm.supplier_id = ?
              AND m.is_active = 1
        `;

    const summaryResults = await marketplaceQuery(summaryQuery, [supplierId]);

    const summary = summaryResults[0];

    // Format each material listing.
    const formattedMaterials = materials.map((m) => {
      const isAvailable =
        Number(m.is_available) === 1 &&
        m.available_quantity !== null &&
        Number(m.available_quantity) > 0 &&
        m.unit_price !== null;

      let statusLabel = "Unavailable";
      let statusClass = "bg-secondary";

      if (isAvailable) {
        statusLabel = "Available";
        statusClass = "bg-success";
      } else if (
        Number(m.is_available) === 1 &&
        m.available_quantity !== null &&
        Number(m.available_quantity) === 0
      ) {
        statusLabel = "Out of Stock";
        statusClass = "bg-warning text-dark";
      } else if (
        m.is_available === null ||
        m.available_quantity === null ||
        m.unit_price === null
      ) {
        statusLabel = "Unconfirmed";
        statusClass = "bg-secondary";
      }

      return {
        ...m,

        price_display: formatPrice(m.unit_price),

        quantity_display: formatQuantity(m.available_quantity),

        specification_display: m.specification || "No specification provided",

        statusLabel,
        statusClass,
        isAvailable,
      };
    });

    const sortOptions = [
      {
        value: "name",
        label: "Material Name",
      },
      {
        value: "price_asc",
        label: "Lowest Price",
      },
      {
        value: "price_desc",
        label: "Highest Price",
      },
      {
        value: "quantity_desc",
        label: "Highest Stock",
      },
    ].map((option) => ({
      ...option,
      selected: option.value === sort,
    }));

    const pageSizes = [25, 50, 100].map((size) => ({
      value: size,
      selected: size === pageSize,
    }));

    const baseUrl = "/marketplace/suppliers/" + encodeURIComponent(supplierId);

    const urlBuilder = (pageNumber) =>
      buildMarketplaceUrl(baseUrl, {
        search,
        category: categoryId,
        sort,
        pageSize,
        page: pageNumber,
      });

    const pagination = buildMarketplacePagination(page, totalPages, urlBuilder);

    res.render("marketplace/supplier-details", {
      categories,
      categoryId,

      supplier: {
        ...supplier,

        email_display: supplier.email || "Not provided",

        phone_display: supplier.phone || "Not provided",

        address_display: supplier.address || "Not provided",

        website_display: supplier.website || "Not provided",
      },

      materials: formattedMaterials,

      summary: {
        total_materials: Number(summary.total_materials).toLocaleString(
          "en-US",
        ),

        available_materials: Number(
          summary.available_materials || 0,
        ).toLocaleString("en-US"),
      },

      search,
      sort,
      pageSize,

      sortOptions,
      pageSizes,

      totalRecords,
      totalRecordsDisplay: totalRecords.toLocaleString("en-US"),

      currentPage: page,
      totalPages,

      startRecord: totalRecords === 0 ? 0 : offset + 1,

      endRecord: Math.min(offset + pageSize, totalRecords),

      hasMaterials: totalRecords > 0,

      ...pagination,
    });
  } catch (error) {
    console.error("Marketplace Supplier Storefront Error:", error);

    res
      .status(500)
      .send(
        '<div class="alert alert-danger">' +
        "Failed to load supplier storefront." +
        "</div>",
      );
  }
});

module.exports = router;
