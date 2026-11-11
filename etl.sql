-- DISupplier | Homework 03 | Extract, Transform, Load (ETL) Process
-- STEP 1 - EXTRACT: ENVIRONMENT SETUP AND SOURCE LOADING

-- 1.1 Select the DISupplier Working Directory
-- Purpose: The PowerShell cd command changes the active folder to the repository containing the
-- data subdirectory and local MySQL volume.
-- ----------------------------------------------------------------------
-- PowerShell: cd "E:\NTUST Courses\Software Engineering in Construction Information Systems\DISupplier\DISupplier"

-- 1.2 Initialize the MySQL database container
-- Purpose: docker run creates and starts a container named disupplier-mysql using the mysql:latest
-- image, initializes disupplier_db and an application user, maps host port 3307 to container
-- port 3306, and mounts persistent storage plus read-only input data.
-- ----------------------------------------------------------------------
-- PowerShell: docker run --name disupplier-mysql -e MYSQL_ROOT_PASSWORD=<YOUR_ROOT_PASSWORD> -e MYSQL_USER=disupplier -e MYSQL_PASSWORD=<YOUR_USER_PASSWORD> -e MYSQL_DATABASE=disupplier_db -p 127.0.0.1:3307:3306 -v "${PWD}\mysql_data:/var/lib/mysql" -v "${PWD}\data:/import:ro" -d mysql:latest

-- 1.3 Connect to MySQL inside Docker
-- Purpose: docker exec -it opens an interactive MySQL client inside the running container using
-- the disupplier account. The -p flag requests a password instead of placing it on the command
-- line.
-- ----------------------------------------------------------------------
-- PowerShell: docker exec -it disupplier-mysql mysql -u disupplier -p

-- 1.4 Confirm Available Databases
-- Purpose: SHOW DATABASES lists the schemas available to the connected user and verifies that
-- initialization created the intended database.
-- ----------------------------------------------------------------------
    SHOW DATABASES;

-- 1.5 Select the DISupplier Databases
-- Purpose: USE disupplier_db makes this schema the target for subsequent unqualified CREATE TABLE
-- and data manipulation statements.
-- ----------------------------------------------------------------------
    USE disupplier_db;

-- 1.6 Inspect Tables Before ETL
-- Purpose: SHOW TABLES lists the current objects, providing a baseline before staging and
-- normalized tables are created.
-- ----------------------------------------------------------------------
    SHOW TABLES;

-- 1.7 Create a Company Staging Table
-- Purpose: The temp_ori_companies table follows the columns in companies.tsv. Broad string fields
-- and an unconstrained staging design enable the original supplier records to be imported
-- before cleaning.
-- ----------------------------------------------------------------------
CREATE TABLE temp_ori_companies (
    company_id VARCHAR(10),
    name VARCHAR(255),
    description TEXT,
    address VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    comments TEXT);

-- 1.8 Create a Material Staging Table
-- Purpose: The temp_ori_materials table mirrors materials.tsv and preserves its material
-- identifier, description, unit, price summary, and sample count. Decimal types allow
-- fractional price statistics.
-- ----------------------------------------------------------------------
CREATE TABLE temp_ori_materials (
    material_id VARCHAR(10),
    item VARCHAR(255),
    unit VARCHAR(50),
    price_avg DECIMAL(15,3),
    price_stdev DECIMAL(15,3),
    no_samples INT);

-- 1.9 Create a Transaction Staging Table
-- Purpose: The temp_ori_transactions table stores transaction references, quantity, price,
-- discount, date, and notes. It is separated from the final relational schema so erroneous
-- source references can first be diagnosed.
-- ----------------------------------------------------------------------
CREATE TABLE temp_ori_transactions (
    transaction_id VARCHAR(10),
    company_id VARCHAR(10),
    material_id VARCHAR(10),
    quantity DECIMAL(15,3),
    price_per_unit DECIMAL(15,3),
    discount_rate DECIMAL(5,2),
    total_price DECIMAL(18,3),
    transaction_date DATE,
    notes TEXT);

-- 1.10 Copy the Companies TSV File
-- Purpose: docker cp transfers companies.tsv from the host data directory into the MySQL
-- container’s file-import directory.
-- ----------------------------------------------------------------------
-- PowerShell: docker cp .\data\companies.tsv disupplier-mysql:/var/lib/mysql-files/

-- 1.12 Copy the Materials TSV File
-- Purpose: docker cp transfers materials.tsv from the host data directory into the MySQL
-- container’s file-import directory.
-- ----------------------------------------------------------------------
-- PowerShell: docker cp .\data\materials.tsv disupplier-mysql:/var/lib/mysql-files/

-- 1.13 Copy the Transactions TSV File
-- Purpose: docker cp transfers transactions.tsv from the host data directory into the MySQL
-- container’s file-import directory.
-- ----------------------------------------------------------------------
-- PowerShell: docker cp .\data\transactions.tsv disupplier-mysql:/var/lib/mysql-files/

-- 1.14 Extract Company Records into Staging Table
-- Purpose: LOAD DATA INFILE bulk-imports tab-separated company data into temp_ori_companies.
-- FIELDS TERMINATED BY sets tabs as separators, OPTIONALLY ENCLOSED BY permits quoted values,
-- LINES TERMINATED BY specifies row boundaries, and IGNORE 1 ROWS skips the header.
-- ----------------------------------------------------------------------
    LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
    INTO TABLE temp_ori_companies
    FIELDS TERMINATED BY '\t'
    OPTIONALLY ENCLOSED BY '"'
    LINES TERMINATED BY '\n'
    IGNORE 1 ROWS;

-- 1.15 Extract Material Records into Staging Table
-- Purpose: LOAD DATA INFILE bulk-imports tab-separated materials data into temp_ori_materials.
-- FIELDS TERMINATED BY sets tabs as separators, OPTIONALLY ENCLOSED BY permits quoted values,
-- LINES TERMINATED BY specifies row boundaries, and IGNORE 1 ROWS skips the header.
-- ----------------------------------------------------------------------
    LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv'
    INTO TABLE temp_ori_materials
    FIELDS TERMINATED BY '\t'
    OPTIONALLY ENCLOSED BY '"'
    LINES TERMINATED BY '\n'
    IGNORE 1 ROWS;

-- 1.16 Extract Transactions into Staging Table
-- Purpose: LOAD DATA INFILE bulk-imports tab-separated transactions data into
-- temp_ori_transactions. FIELDS TERMINATED BY sets tabs as separators, OPTIONALLY ENCLOSED BY
-- permits quoted values, LINES TERMINATED BY specifies row boundaries, and IGNORE 1 ROWS skips
-- the header.
-- ----------------------------------------------------------------------
    LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
    INTO TABLE temp_ori_transactions
    FIELDS TERMINATED BY '\t'
    OPTIONALLY ENCLOSED BY '"'
    LINES TERMINATED BY '\n'
    IGNORE 1 ROWS;


-- STEP 2 - DATA QUALITY ASSESSMENT BEFORE CLEANING

-- 2.1 Profile Null or Blank Company Fields
-- Purpose: Conditional SUM expressions count missing values per company field. IS NULL catches
-- database nulls; TRIM(field) = empty string catches whitespace-only text.
-- ----------------------------------------------------------------------
SELECT
    SUM(company_id IS NULL OR TRIM(company_id) = '') AS missing_company_id,
    SUM(name IS NULL OR TRIM(name) = '') AS missing_name,
    SUM(description IS NULL OR TRIM(description) = '') AS missing_description,
    SUM(address IS NULL OR TRIM(address) = '') AS missing_address,
    SUM(phone IS NULL OR TRIM(phone) = '') AS missing_phone,
    SUM(email IS NULL OR TRIM(email) = '') AS missing_email,
    SUM(comments IS NULL OR TRIM(comments) = '') AS missing_comments
FROM temp_ori_companies;

-- 2.2 Profile Null or Blank Material Fields
-- Purpose: The query counts missing identifiers, descriptions and units as well as NULL
-- statistical fields.
-- ----------------------------------------------------------------------
SELECT
    SUM(material_id IS NULL OR TRIM(material_id) = '') AS missing_material_id,
    SUM(item IS NULL OR TRIM(Item) = '') AS missing_item,
    SUM(unit IS NULL OR TRIM(Unit) = '') AS missing_unit,
    SUM(price_avg IS NULL) AS missing_price_avg,
    SUM(price_stdev IS NULL) AS missing_price_stdev,
    SUM(no_samples IS NULL) AS missing_no_samples
FROM temp_ori_materials;

-- 2.3 Profile Null or Blank Transaction Fields
-- Purpose: Missing fields are counted separately for transaction IDs, supplier and material
-- references, quantities, prices, discounts, dates and notes. It establishes which fields may
-- need attention before loading.
-- ----------------------------------------------------------------------
SELECT
    SUM(transaction_id IS NULL OR TRIM(transaction_id) = '') AS missing_transaction_id,
    SUM(company_id IS NULL OR TRIM(company_id) = '') AS missing_company_id,
    SUM(material_id IS NULL OR TRIM(material_id) = '') AS missing_material_id,
    SUM(quantity IS NULL) AS missing_quantity,
    SUM(price_per_unit IS NULL) AS missing_price_per_unit,
    SUM(discount_rate IS NULL) AS missing_discount_rate,
    SUM(total_price IS NULL) AS missing_total_price,
    SUM(transaction_date IS NULL) AS missing_transaction_date,
    SUM(notes IS NULL OR TRIM(notes) = '') AS missing_notes
FROM temp_ori_transactions;

-- 2.4 Detect Repeated Company Identifiers
-- Purpose: GROUP BY company_id and HAVING COUNT(*) > 1 report duplicate source IDs, which could
-- otherwise cause ambiguous primary keys in the suppliers table.
-- ----------------------------------------------------------------------
SELECT company_id, COUNT(*) AS duplicate_count
FROM temp_ori_companies
GROUP BY company_id
    HAVING COUNT(*) > 1;

-- 2.5 Detect Repeated Material Identifiers
-- Purpose: GROUP BY material_id and HAVING COUNT(*) > 1 report duplicate source IDs, which could
-- otherwise cause ambiguous primary keys in the materials table.
-- ----------------------------------------------------------------------
SELECT material_id, COUNT(*) AS duplicate_count
FROM temp_ori_materials
GROUP BY material_id
    HAVING COUNT(*) > 1;

-- 2.6 Detect Repeated Transaction Identifiers
-- Purpose: Repeated transaction IDs would make the later transaction-to-requirement/PO mapping
-- ambiguous. This query tests uniqueness in the imported transaction data.
-- ----------------------------------------------------------------------
SELECT transaction_id, COUNT(*) AS duplicate_count
FROM temp_ori_transactions
GROUP BY transaction_id
    HAVING COUNT(*) > 1;

-- 2.7 Check Invalid Material Statistics
-- Purpose: The query counts materials with negative average price, negative price dispersion, or a
-- nonpositive sample count. These are invalid value rules tested against the staging records.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS invalid_materials
FROM temp_ori_materials
WHERE price_avg < 0
    OR price_stdev < 0
    OR no_samples <= 0;

-- 2.8 Check Invalid Transaction Values
-- Purpose: The filter identifies negative prices, negative totals, nonpositive quantities, and
-- discount rates outside 0–100%. These represent business-rule validation rather than
-- reference validation.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS invalid_transactions
FROM temp_ori_transactions
WHERE quantity <= 0
    OR price_per_unit < 0
    OR discount_rate < 0
    OR discount_rate > 100
    OR total_price < 0;

-- 2.9 List Transactions Referencing Missing Companies
-- Purpose: A LEFT JOIN retains every transaction; records with no matching company become NULL on
-- the joined side. These are displayed for inspection.
-- ----------------------------------------------------------------------
SELECT t.transaction_id, t.company_id
FROM temp_ori_transactions t
LEFT JOIN temp_ori_companies c
ON t.company_id = c.company_id
WHERE c.company_id IS NULL;

-- 2.10 Count Transactions Referencing Missing Companies
-- Purpose: This query aggregates the prior missing-company check into a count. A transaction may
-- also lack a material, so its result must not simply be added to the missing-material count.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS missing_company_references
FROM temp_ori_transactions t
LEFT JOIN temp_ori_companies c
ON t.company_id = c.company_id
WHERE c.company_id IS NULL;

-- 2.11 List Transactions Referencing Missing Materials
-- Purpose: The same LEFT JOIN / IS NULL anti-match technique detects material IDs absent from the
-- master catalog.
-- ----------------------------------------------------------------------
SELECT t.transaction_id, t.material_id
FROM temp_ori_transactions t
LEFT JOIN temp_ori_materials m
ON t.material_id = m.material_id
WHERE m.material_id IS NULL;

-- 2.12 Count Transactions Referencing Missing Materials
-- Purpose: The query summarizes all transactions with an invalid material reference. It overlaps
-- with the missing-company population when both references are absent.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS missing_material_references
FROM temp_ori_transactions t
LEFT JOIN temp_ori_materials m
ON t.material_id = m.material_id
WHERE m.material_id IS NULL;

-- 2.13 Count Transactions with Both References Valid
-- Purpose: INNER JOIN to both master lists keeps transactions for which both company_id and
-- material_id exist, giving the usable transaction population.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS valid_transactions
FROM temp_ori_transactions t
INNER JOIN temp_ori_companies c
ON t.company_id = c.company_id
INNER JOIN temp_ori_materials m
ON t.material_id = m.material_id;

-- 2.14 Classify Mutually Exclusive Reference Problems
-- Purpose: A CASE expression divides transactions into four nonoverlapping groups: both valid,
-- missing company only, missing material only, and missing both. This resolves overlap between
-- the separate missing-reference queries. The notes record 2,469 company-only, 2,497
-- material-only, and 146 both-missing rows: 5,112 invalid transactions altogether.
-- ----------------------------------------------------------------------
SELECT
    CASE
    WHEN c.company_id IS NOT NULL AND m.material_id IS NOT NULL THEN 'Both references valid'
    WHEN c.company_id IS NULL AND m.material_id IS NOT NULL THEN 'Missing company only'
    WHEN c.company_id IS NOT NULL AND m.material_id IS NULL THEN 'Missing material only'
    ELSE 'Missing both'
    END AS validation_status,
    COUNT(*) AS total_transactions
FROM temp_ori_transactions t
LEFT JOIN temp_ori_companies c ON t.company_id = c.company_id
LEFT JOIN temp_ori_materials m ON t.material_id = m.material_id
GROUP BY validation_status;

-- 2.15 Identify Possible Duplicate Supplier Names
-- Purpose: LOWER and TRIM normalize names for comparison; COUNT(DISTINCT company_id) reveals one
-- normalized name associated with multiple identifiers. This is a review query, not an
-- automatic deduplication rule.
-- ----------------------------------------------------------------------
SELECT
    LOWER(TRIM(name)) AS company_name,
    COUNT(*) AS total_records,
    COUNT(DISTINCT company_id) AS different_ids
FROM temp_ori_companies
GROUP BY LOWER(TRIM(name))
    HAVING COUNT(DISTINCT company_id) > 1;

-- 2.16 Identify Possible Duplicate Material Names
-- Purpose: The corresponding query checks identical normalized item descriptions across distinct
-- material IDs. A match may indicate duplication or legitimately different catalog records and
-- therefore was not automatically merged.
-- ----------------------------------------------------------------------
SELECT
    LOWER(TRIM(Item)) AS material_name,
    COUNT(*) AS total_records,
    COUNT(DISTINCT material_id) AS different_ids
FROM temp_ori_materials
GROUP BY LOWER(TRIM(Item))
    HAVING COUNT(DISTINCT material_id) > 1;


-- STEP 3 - TRANSFORM: CLEANING AND STANDARDIZATION

-- 3.1 Create a Transaction Cleaning Workspace
-- Purpose: CREATE TABLE ... AS SELECT duplicates staging rows into cleaned_transactions. The
-- original raw staging data remains available for auditing.
-- ----------------------------------------------------------------------
CREATE TABLE cleaned_transactions AS
SELECT * FROM temp_ori_transactions;

-- 3.2 Remove Transactions with Invalid References
-- Purpose: DELETE with LEFT JOIN removes transactions that have no corresponding company or no
-- corresponding material. The notes record 5,112 removed rows; the deletion does not modify
-- temp_ori_transactions.
-- ----------------------------------------------------------------------
DELETE t
FROM cleaned_transactions t
LEFT JOIN temp_ori_companies c
ON t.company_id = c.company_id
LEFT JOIN temp_ori_materials m
ON t.material_id = m.material_id
WHERE c.company_id IS NULL
    OR m.material_id IS NULL;

-- 3.3 Confirm Cleaned Transaction Count
-- Purpose: COUNT(*) checks the number of retained transactions after reference filtering. The
-- notes report 46,835 records.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS remaining_transactions
FROM cleaned_transactions;

-- 3.4 Recheck Transaction References after Deletion
-- Purpose: Repeating the anti-match query verifies that no remaining cleaned transaction points to
-- an absent source company or material. The note does not provide the numeric result.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS invalid_references
FROM cleaned_transactions t
LEFT JOIN temp_ori_companies c
ON t.company_id = c.company_id
LEFT JOIN temp_ori_materials m
ON t.material_id = m.material_id
WHERE c.company_id IS NULL
    OR m.material_id IS NULL;

-- 3.5 Categorize Transaction Total-Price Patterns
-- Purpose: A CASE comparison separates values matching the discounted amount rounded to the
-- nearest ten, values equal to the unit price, and other discrepancies. The notes record
-- 43,673, 2,289, and 873 respectively; these are diagnostic categories, not all confirmed
-- accounting errors.
-- ----------------------------------------------------------------------
SELECT
    CASE
    WHEN total_price = ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1)
    THEN 'Correct or rounded'
    WHEN total_price = price_per_unit THEN 'Total equals unit price'
    ELSE 'Other discrepancies'
    END AS price_validation,
    COUNT(*) AS total_transactions
FROM cleaned_transactions
GROUP BY price_validation;

-- 3.6 Inspect Samples of Other Price Discrepancies
-- Purpose: The query displays up to 20 records with calculated discounted totals, MySQL rounding,
-- and the observed difference, excluding the already identified unit-price pattern. It
-- supports diagnosis of the 873 other cases.
-- ----------------------------------------------------------------------
SELECT
    transaction_id, quantity, price_per_unit, discount_rate, total_price,
    quantity * price_per_unit * (1 - discount_rate / 100) AS calculated_total,
    ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1) AS mysql_rounded,
    total_price - ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1) AS difference
FROM cleaned_transactions
WHERE total_price <> ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1)
    AND total_price <> price_per_unit
LIMIT 20;

-- 3.7 Count the Distribution of Rounding Differences
-- Purpose: Grouping by the difference between recorded and rounded totals reveals recurrent
-- offsets. The notes describe checking whether the 873 other cases follow a rounding pattern;
-- they do not document an update to these rows.
-- ----------------------------------------------------------------------
SELECT
    total_price - ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1) AS difference,
    COUNT(*) AS total_transactions
FROM cleaned_transactions
WHERE total_price <> ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1)
    AND total_price <> price_per_unit
GROUP BY difference;

-- 3.8 Correct the Targeted Unit-Price-Total Anomaly
-- Purpose: An UPDATE recalculates total_price only when the stored total equals the unit price yet
-- differs materially from quantity × price × (1−discount/100). A nested CASE uses a
-- half-to-even rule when the discounted amount ends exactly in 5 at the tens boundary, and
-- ROUND(...,-1) otherwise. It does not indiscriminately rewrite all 46,835 rows.
-- ----------------------------------------------------------------------
UPDATE cleaned_transactions
SET total_price = CASE
    WHEN MOD(quantity * price_per_unit * (1 - discount_rate / 100), 10) = 5
    THEN CASE
    WHEN MOD(FLOOR(quantity * price_per_unit * (1 - discount_rate / 100) / 10), 2) = 0
    THEN FLOOR(quantity * price_per_unit * (1 - discount_rate / 100) / 10) * 10
    ELSE CEIL(quantity * price_per_unit * (1 - discount_rate / 100) / 10) * 10
    END
    ELSE ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1)
    END
WHERE total_price = price_per_unit
    AND ABS(total_price - quantity * price_per_unit * (1 - discount_rate / 100)) > 0.01;

-- 3.9 Check Whether Targeted Incorrect Totals Remain
-- Purpose: The follow-up COUNT tests for the same unit-price-total anomaly after the UPDATE. The
-- command is present, but its output count is not supplied in the notes.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS remaining_incorrect_totals
FROM cleaned_transactions
WHERE total_price = price_per_unit
    AND ABS(total_price - quantity * price_per_unit * (1 - discount_rate / 100)) > 0.01;

-- 3.10 Classify Existing Supplier Phone Formats
-- Purpose: CASE and LIKE sort phone values into international-prefix, parentheses, or plain
-- formats. This shows why later phone cleanup is needed.
-- ----------------------------------------------------------------------
SELECT
    CASE
    WHEN phone LIKE '+1-%' THEN 'International Format'
    WHEN phone LIKE '(%' THEN 'Parentheses Format'
    ELSE 'Plain Format'
    END AS phone_format,
    COUNT(*) AS total_companies
FROM temp_ori_companies
GROUP BY phone_format;

-- 3.11 Detect Phone Extensions
-- Purpose: REGEXP x[0-9]+$ checks for numbers ending in an x-style extension so they can be
-- considered during formatting.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS phones_with_extension
FROM temp_ori_companies
WHERE phone REGEXP 'x[0-9]+$';

-- 3.12 Create a Company Cleaning Workspace
-- Purpose: CREATE TABLE ... AS SELECT preserves a working copy of all raw company fields;
-- subsequent updates do not affect the original staging table.
-- ----------------------------------------------------------------------
CREATE TABLE cleaned_companies AS
SELECT * FROM temp_ori_companies;

-- 3.13 Preview a Full Phone Normalization Approach
-- Purpose: Nested REGEXP_REPLACE removes extensions and non-digits for analysis; CASE strips
-- leading country code +1 where present; CONCAT and SUBSTRING construct a candidate 3-3-4
-- display format, with optional extension. LIMIT 20 previews the result without changing data.
-- ----------------------------------------------------------------------
SELECT
    company_id, original_phone,
    CONCAT(
    SUBSTRING(digits, 1, 3), '-',
    SUBSTRING(digits, 4, 3), '-',
    SUBSTRING(digits, 7, 4),
    CASE WHEN extension IS NOT NULL THEN CONCAT(' x', extension) ELSE '' END)
    AS standardized_phone
FROM (
SELECT
    company_id, phone AS original_phone,
    REGEXP_REPLACE(REGEXP_REPLACE(phone, ' x[0-9]+$', ''), '[^0-9]', '') AS all_digits,
    CASE
    WHEN phone LIKE '+1-%' THEN SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(phone, ' x[0-9]+$', ''), '[^0-9]', ''), 2)
    ELSE REGEXP_REPLACE(REGEXP_REPLACE(phone, ' x[0-9]+$', ''), '[^0-9]', '')
    END AS digits,
    CASE WHEN phone REGEXP ' x[0-9]+$' THEN SUBSTRING_INDEX(phone, 'x', -1) ELSE NULL END AS extension
FROM cleaned_companies
    ) AS phone_data
LIMIT 20;

-- 3.14 Apply Partial Phone-Format Cleanup
-- Purpose: The actual UPDATE removes an initial +1- prefix and simplifies selected parentheses
-- conventions. Unlike the more elaborate preview, this executed UPDATE does not fully
-- reconstruct every phone number into a uniform 3-3-4 format.
-- ----------------------------------------------------------------------
UPDATE cleaned_companies
SET phone = TRIM(REPLACE(REPLACE(REGEXP_REPLACE(phone, '^\\+1-', ''), '(', ''), ') ', '-'));

-- 3.15 Create a Material Cleaning Workspace
-- Purpose: CREATE TABLE ... AS SELECT copies the raw material records to cleaned_materials for
-- classification and text adjustments.
-- ----------------------------------------------------------------------
CREATE TABLE cleaned_materials AS
SELECT * FROM temp_ori_materials;

-- 3.16 Add the Derived Material-Category Field
-- Purpose: ALTER TABLE ADD COLUMN extends only the working material data, enabling classification
-- before loading the normalized material_categories lookup table.
-- ----------------------------------------------------------------------
ALTER TABLE cleaned_materials
    ADD COLUMN category VARCHAR(50);

-- 3.17 Classify Product Entries
-- Purpose: REGEXP matches item names beginning with Product or Products and a period/colon.
-- category IS NULL keeps previously assigned categories from being overwritten.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Products'
WHERE (Item REGEXP '^Products?[.:]')
    AND category IS NULL;

-- 3.18 Classify Operator Labor
-- Purpose: Records containing operator are labeled Labor-Operator if they have not already been
-- assigned a category.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Labor-Operator'
WHERE Item REGEXP 'operator'
    AND category IS NULL;

-- 3.19 Classify Technician Labor
-- Purpose: The same conditional UPDATE classifies remaining descriptions containing technician as
-- Labor-Technician.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Labor-Technician'
WHERE Item REGEXP 'technician'
    AND category IS NULL;

-- 3.20 Classify Quality-Management Dervices
-- Purpose: LIKE searches for the quality management phrase and assigns that category only to
-- unclassified items.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Quality Management'
WHERE Item LIKE '%quality management%'
    AND category IS NULL;

-- 3.21 Classify General Worker Labor
-- Purpose: LIKE looks for worker in remaining text and assigns Labor-General Worker, while the
-- NULL test protects earlier categories.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Labor-General Worker'
WHERE Item LIKE '%worker%'
    AND category IS NULL;

-- 3.22 Fill Remaining Category Gaps
-- Purpose: All still-unclassified descriptions are assigned Other. This ensures categories can
-- later be joined as non-NULL foreign-key values.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET category = 'Other'
WHERE category IS NULL;

-- 3.23 Strip Redundant Product Prefixes
-- Purpose: REGEXP_REPLACE removes a Products:/Product. style leading label from item names, TRIM
-- removes extra whitespace, and the final nonempty check prevents blank names.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET Item = TRIM(REGEXP_REPLACE(Item, '^Products?[.:][[:space:]]*', ''))
WHERE category = 'Products'
    AND Item REGEXP '^Products?[.:][[:space:]]*'
    AND TRIM(REGEXP_REPLACE(Item, '^Products?[.:][[:space:]]*', '')) <> '';

-- 3.24 Strip Redundant Quality-Management Prefixes
-- Purpose: The analogous UPDATE removes the leading Quality management label, leaving the
-- descriptive specification while retaining its separate category.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET Item = TRIM(REGEXP_REPLACE(Item, '^Quality management[.:][[:space:]]*', ''))
WHERE category = 'Quality Management'
    AND Item REGEXP '^Quality management[.:]'
    AND TRIM(REGEXP_REPLACE(Item, '^Quality management[.:][[:space:]]*', '')) <> '';

-- 3.25 Standardize Selected Quality-Management Headings
-- Purpose: Two nested case-insensitive REGEXP_REPLACE calls capitalize specified leading headings:
-- Test Specifications and Standards and Civil Engineering and Construction Inspections. The
-- rest of the descriptive text is intentionally not broadly title-cased.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET Item = REGEXP_REPLACE(
    REGEXP_REPLACE(Item, '^Test specifications and standards\\.', 'Test Specifications and Standards.', 1, 1, 'i'),
    '^Test Specifications and Standards\\. Civil engineering and construction inspections?\\.',
    'Test Specifications and Standards. Civil Engineering and Construction Inspections.', 1, 1, 'i'
)
WHERE category = 'Quality Management'
    AND Item REGEXP '^Test specifications and standards\\.';

-- 3.26 Build Temporary Sentence-Case Product Strings
-- Purpose: A recursive common-table expression splits product descriptions at period-space
-- boundaries, retaining order with part_no. GROUP_CONCAT rebuilds sentences with a leading
-- capital, while replacements restore technical abbreviations such as PVC, SD280, AC-10, and
-- MPa. The temporary table is an intermediate workspace, not the final materials table.
-- ----------------------------------------------------------------------
CREATE TEMPORARY TABLE standardized_products AS
    WITH RECURSIVE sentences AS (
SELECT
    material_id, TRIM(SUBSTRING_INDEX(Item, '. ', 1)) AS part,
    CASE WHEN INSTR(Item, '. ') > 0 THEN SUBSTRING(Item, INSTR(Item, '. ') + 2) ELSE '' END AS remaining,
    1 AS part_no
FROM cleaned_materials
WHERE category = 'Products'
UNION ALL
SELECT
    material_id, TRIM(SUBSTRING_INDEX(remaining, '. ', 1)),
    CASE WHEN INSTR(remaining, '. ') > 0 THEN SUBSTRING(remaining, INSTR(remaining, '. ') + 2) ELSE '' END,
    part_no + 1
FROM sentences
WHERE remaining <> '' AND part_no < 100
)
SELECT
    material_id,
    REPLACE(REPLACE(REPLACE(REPLACE(
    GROUP_CONCAT(CONCAT(UPPER(LEFT(LOWER(part), 1)), SUBSTRING(LOWER(part), 2))
ORDER BY part_no SEPARATOR '. '),
    'pvc', 'PVC'), 'sd280', 'SD280'), 'ac-10', 'AC-10'), 'mpa', 'MPa'
    ) AS standardized_item
FROM sentences
GROUP BY material_id;

-- 3.27 Apply Standardized Product Descriptions
-- Purpose: UPDATE ... JOIN replaces each Products item with its matched standardized_item, but
-- only when a nonempty replacement was produced.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials m
JOIN standardized_products s
ON m.material_id = s.material_id
SET m.Item = s.standardized_item
WHERE m.category = 'Products'
    AND s.standardized_item IS NOT NULL
    AND s.standardized_item <> '';

-- 3.28 Identify Case-Sensitive Unit Variants
-- Purpose: COLLATE utf8mb4_bin makes the grouped unit values case-sensitive, revealing variations
-- such as piece versus Piece that a case-insensitive collation could hide.
-- ----------------------------------------------------------------------
SELECT
    Unit COLLATE utf8mb4_bin AS material_unit,
    COUNT(*) AS total_materials
FROM cleaned_materials
GROUP BY material_unit
ORDER BY total_materials DESC;

-- 3.29 Standardize Selected Unit Labels
-- Purpose: A CASE update changes exactly the identified case variants piece → Piece and one test →
-- One test. It does not convert units of measure or standardize every possible variation.
-- ----------------------------------------------------------------------
UPDATE cleaned_materials
SET Unit = CASE
    WHEN BINARY Unit = 'piece' THEN 'Piece'
    WHEN BINARY Unit = 'one test' THEN 'One test'
    ELSE Unit
    END
WHERE BINARY Unit IN ('piece', 'one test');


-- STEP 4 - LOAD: NORMALIZED TARGET DATABASE

-- 4.1 Define Unique Material Category Names
-- Purpose: Creates material_categories with UUID-based category_id and UNIQUE category_name; later
-- materials reference these keys rather than repeating category text.
-- ----------------------------------------------------------------------
CREATE TABLE material_categories (
    category_id CHAR(36) PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP
);

-- 4.2 Populate the Material-Category Lookup
-- Purpose: SELECT DISTINCT obtains every populated category from cleaned_materials, and UUID()
-- supplies a new category identifier for each distinct label.
-- ----------------------------------------------------------------------
INSERT INTO material_categories (category_id, category_name)
SELECT UUID(), category
FROM (
SELECT DISTINCT category
FROM cleaned_materials
WHERE category IS NOT NULL
    ) AS unique_categories;

-- 4.3 Define the Final Material Catalog
-- Purpose: Creates materials with the source material ID as its VARCHAR(8) primary key.
-- category_id is a foreign key; specification, unit and lifecycle metadata complete the
-- catalog.
-- ----------------------------------------------------------------------
CREATE TABLE materials (
    material_id VARCHAR(8) PRIMARY KEY,
    category_id CHAR(36) NOT NULL,
    material_name VARCHAR(150) NOT NULL,
    specification TEXT,
    unit VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id)
    REFERENCES material_categories(category_id)
);

-- 4.4 Load Classified Materials into the Catalog
-- Purpose: INSERT ... SELECT joins cleaned_materials to material_categories by category name and
-- stores the corresponding UUID. LEFT(TRIM(item),150) fits a display name; text longer than
-- 150 characters is retained in specification.
-- ----------------------------------------------------------------------
INSERT INTO materials (material_id, category_id, material_name, specification, unit)
SELECT
    m.material_id, c.category_id,
    LEFT(TRIM(m.item), 150),
    CASE WHEN CHAR_LENGTH(TRIM(m.item)) > 150 THEN TRIM(m.item) ELSE NULL END,
    m.unit
FROM cleaned_materials m
JOIN material_categories c ON m.category = c.category_name;

-- 4.5 Define the Suppliers Entity
-- Purpose: Creates suppliers with the original source company_id stored as supplier_id. Contact
-- fields are mandatory; optional account/website fields remain available for application use.
-- ----------------------------------------------------------------------
CREATE TABLE suppliers (
    supplier_id VARCHAR(8) PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255),
    phone VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    website VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP
);

-- 4.6 Load Historical Companies as Suppliers
-- Purpose: INSERT ... SELECT maps cleaned_companies.company_id and name to suppliers.supplier_id
-- and supplier_name, preserving the existing supplier IDs used by cleaned_transactions.
-- ----------------------------------------------------------------------
INSERT INTO suppliers (supplier_id, supplier_name, email, phone, address)
SELECT company_id, name, email, phone, address
FROM cleaned_companies;

-- 4.7 Define the Supplier-Material Bridge
-- Purpose: Creates supplier_materials for many-to-many supplier/material relationships. A
-- UNIQUE(supplier_id,material_id) constraint prevents repeated pairs, while two foreign keys
-- enforce valid references.
-- ----------------------------------------------------------------------
CREATE TABLE supplier_materials (
    supplier_material_id CHAR(36) PRIMARY KEY,
    supplier_id VARCHAR(8) NOT NULL,
    material_id VARCHAR(8) NOT NULL,
    unit_price DECIMAL(15,2),
    is_available BOOLEAN DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE (supplier_id, material_id),
    FOREIGN KEY (supplier_id)
    REFERENCES suppliers(supplier_id),
    FOREIGN KEY (material_id)
    REFERENCES materials(material_id)
);

-- 4.8 Load Observed Supplier-Material Combinations
-- Purpose: SELECT DISTINCT retrieves pairs observed in cleaned_transactions, joins each to valid
-- suppliers and materials, and assigns UUID-based bridge IDs. Unit price and availability are
-- not populated by this step.
-- ----------------------------------------------------------------------
INSERT INTO supplier_materials (supplier_material_id, supplier_id, material_id)
SELECT UUID(), t.company_id, t.material_id
FROM (
SELECT DISTINCT company_id, material_id
FROM cleaned_transactions
    ) AS t
JOIN suppliers s ON t.company_id = s.supplier_id
JOIN materials m ON t.material_id = m.material_id;

-- 4.9 Define a Shared Status Lookup
-- Purpose: Creates statuses with status_type and status_name; the compound UNIQUE constraint
-- allows the same name to have different meanings in different workflow contexts.
-- ----------------------------------------------------------------------
CREATE TABLE statuses (
    status_id CHAR(36) PRIMARY KEY,
    status_type VARCHAR(50) NOT NULL,
    status_name VARCHAR(30) NOT NULL,
    description TEXT,
    UNIQUE (status_type, status_name)
);

-- 4.10 Populate Standard Workflow Statuses
-- Purpose: Loads statuses for projects, project activities, purchase orders, and deliveries. The
-- later simulated records resolve the proper row by both status_type and status_name.
-- ----------------------------------------------------------------------
INSERT INTO statuses (status_id, status_type, status_name, description)
VALUES
-- Project statuses
    (UUID(), 'Project', 'Planned', 'Project has been planned'),
    (UUID(), 'Project', 'In Progress', 'Project is under construction'),
    (UUID(), 'Project', 'Completed', 'Project has been completed'),
    (UUID(), 'Project', 'On Hold', 'Project is temporarily suspended'),
    (UUID(), 'Project', 'Cancelled', 'Project has been cancelled'),
-- Project activity statuses
    (UUID(), 'Project Activity', 'Not Started', 'Activity has not started'),
    (UUID(), 'Project Activity', 'In Progress', 'Activity is ongoing'),
    (UUID(), 'Project Activity', 'Completed', 'Activity has been completed'),
    (UUID(), 'Project Activity', 'On Hold', 'Activity is temporarily suspended'),
-- Purchase order statuses
    (UUID(), 'Purchase Order', 'Draft', 'Purchase order is being prepared'),
    (UUID(), 'Purchase Order', 'Issued', 'Purchase order has been issued'),
    (UUID(), 'Purchase Order', 'Confirmed', 'Supplier has confirmed the order'),
    (UUID(), 'Purchase Order', 'Completed', 'Purchase order has been fulfilled'),
    (UUID(), 'Purchase Order', 'Cancelled', 'Purchase order has been cancelled'),
-- Delivery statuses
    (UUID(), 'Delivery', 'Scheduled', 'Delivery has been scheduled'),
    (UUID(), 'Delivery', 'In Transit', 'Materials are being transported'),
    (UUID(), 'Delivery', 'Delivered', 'Materials have arrived'),
    (UUID(), 'Delivery', 'Partially Delivered', 'Only part of the order has arrived'),
    (UUID(), 'Delivery', 'Cancelled', 'Delivery has been cancelled');

-- 4.11 Define Contractor Companies Separate from Suppliers
-- Purpose: Creates companies as the organizations managing projects; these are separate from
-- historical suppliers. The original transaction company_id is mapped to suppliers, not to
-- these generated contractor companies.
-- ----------------------------------------------------------------------
CREATE TABLE companies (
    company_id CHAR(36) PRIMARY KEY,
    company_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP
);

-- 4.12 Define Authorization Roles
-- Purpose: Creates the roles lookup with unique role_name values used when generating test users.
-- ----------------------------------------------------------------------
CREATE TABLE roles (
    role_id CHAR(36) PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

-- 4.13 Populate Application Roles
-- Purpose: Inserts Administrator, Project Manager, Procurement Officer and Site Engineer roles
-- with their main responsibilities.
-- ----------------------------------------------------------------------
INSERT INTO roles (role_id, role_name, description)
VALUES
    (UUID(), 'Administrator',
    'Manages company users, roles, and system settings'),
    (UUID(), 'Project Manager',
    'Manages construction projects, activities, and material requirements'),
    (UUID(), 'Procurement Officer',
    'Manages material procurement, supplier selection, and purchase orders'),
    (UUID(), 'Site Engineer',
    'Manages site activities, material requirements, and delivery verification');

-- 4.14 Define Internal User Accounts
-- Purpose: Creates users with foreign keys to contractor companies and roles and UNIQUE email. A
-- password field is present; the later demo values are only test data and should be hashed for
-- any deployment.
-- ----------------------------------------------------------------------
CREATE TABLE users (
    user_id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    role_id CHAR(36) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id)
    REFERENCES companies(company_id),
    FOREIGN KEY (role_id)
    REFERENCES roles(role_id)
);

-- 4.15 Define Construction Projects
-- Purpose: Creates projects with contractor-company and status foreign keys and a CHECK ensuring
-- that end_date is not before start_date whenever both are provided.
-- ----------------------------------------------------------------------
CREATE TABLE projects (
    project_id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    project_name VARCHAR(50) NOT NULL,
    description TEXT,
    location TEXT,
    start_date DATE,
    end_date DATE,
    status_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id)
    REFERENCES companies(company_id),
    FOREIGN KEY (status_id)
    REFERENCES statuses(status_id),
    CONSTRAINT chk_project_dates
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- 4.16 Define User-to-Project Memberships
-- Purpose: Creates project_members to implement the many-to-many connection between projects and
-- internal users. UNIQUE(project_id,user_id) prevents repeat assignments.
-- ----------------------------------------------------------------------
CREATE TABLE project_members (
    project_member_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    CONSTRAINT uq_project_members
    UNIQUE (project_id, user_id),
    FOREIGN KEY (project_id)
    REFERENCES projects(project_id),
    FOREIGN KEY (user_id)
    REFERENCES users(user_id),
    FOREIGN KEY (updated_by)
    REFERENCES users(user_id)
);

-- 4.17 Define Construction Activities
-- Purpose: Creates project_activities with links to projects, optional assigned users, status
-- lookup, and a date-order CHECK. Activities provide an intermediate link from a historical
-- transaction to a project.
-- ----------------------------------------------------------------------
CREATE TABLE project_activities (
    activity_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    assigned_to CHAR(36),
    status_id CHAR(36) NOT NULL,
    activity_name VARCHAR(150) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    FOREIGN KEY (project_id)
    REFERENCES projects(project_id),
    FOREIGN KEY (assigned_to)
    REFERENCES users(user_id),
    FOREIGN KEY (status_id)
    REFERENCES statuses(status_id),
    FOREIGN KEY (updated_by)
    REFERENCES users(user_id),
    CONSTRAINT chk_activity_dates
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

-- 4.18 Define Material Requirements per Activity
-- Purpose: Creates project_materials_requirements with material and activity references;
-- required_quantity DECIMAL(15,3) and CHECK(required_quantity > 0) protect positive demand
-- values.
-- ----------------------------------------------------------------------
CREATE TABLE project_materials_requirements (
    requirement_id CHAR(36) PRIMARY KEY,
    material_id VARCHAR(8) NOT NULL,
    activity_id CHAR(36),
    required_quantity DECIMAL(15,3) NOT NULL,
    required_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    FOREIGN KEY (material_id)
    REFERENCES materials(material_id),
    FOREIGN KEY (activity_id)
    REFERENCES project_activities(activity_id),
    FOREIGN KEY (updated_by)
    REFERENCES users(user_id),
    CONSTRAINT chk_required_quantity
    CHECK (required_quantity > 0)
);

-- 4.19 Define Purchase-Order Headers
-- Purpose: Creates purchase_orders with project, supplier and status foreign keys, a unique
-- human-readable po_number, order date and optional delivery date. A CHECK prevents an
-- expected delivery date preceding the order date.
-- ----------------------------------------------------------------------
CREATE TABLE purchase_orders (
    purchase_order_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    supplier_id VARCHAR(8) NOT NULL,
    created_by CHAR(36),
    po_number VARCHAR(30) NOT NULL UNIQUE,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    status_id CHAR(36) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)
    REFERENCES projects(project_id),
    FOREIGN KEY (supplier_id)
    REFERENCES suppliers(supplier_id),
    FOREIGN KEY (created_by)
    REFERENCES users(user_id),
    FOREIGN KEY (status_id)
    REFERENCES statuses(status_id),
    CONSTRAINT chk_po_delivery_date
    CHECK (expected_delivery_date IS NULL OR expected_delivery_date >= order_date)
);

-- 4.20 Define Purchase-Order Lines
-- Purpose: Creates purchase_order_items with purchase order, supplier-material, and requirement
-- references. Quantity must be positive and agreed unit price nonnegative.
-- ----------------------------------------------------------------------
CREATE TABLE purchase_order_items (
    po_item_id CHAR(36) PRIMARY KEY,
    purchase_order_id CHAR(36) NOT NULL,
    supplier_material_id CHAR(36) NOT NULL,
    requirement_id CHAR(36) NOT NULL,
    ordered_quantity DECIMAL(15,3) NOT NULL,
    agreed_unit_price DECIMAL(15,2) NOT NULL,
    FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(purchase_order_id),
    FOREIGN KEY (supplier_material_id)
    REFERENCES supplier_materials(supplier_material_id),
    FOREIGN KEY (requirement_id)
    REFERENCES project_materials_requirements(requirement_id),
    CONSTRAINT chk_po_item_quantity
    CHECK (ordered_quantity > 0),
    CONSTRAINT chk_po_item_price
    CHECK (agreed_unit_price >= 0)
);

-- 4.21 Define delivery headers for the future workflow
-- Purpose: Creates deliveries with PO and status links plus scheduling and receipt fields. There
-- is no delivery-row INSERT in the supplied ETL record.
-- ----------------------------------------------------------------------
CREATE TABLE deliveries (
    delivery_id CHAR(36) PRIMARY KEY,
    purchase_order_id CHAR(36) NOT NULL,
    status_id CHAR(36) NOT NULL,
    received_by CHAR(36),
    delivery_number VARCHAR(30) NOT NULL UNIQUE,
    scheduled_date DATE NOT NULL,
    actual_arrival_at TIMESTAMP NULL DEFAULT NULL,
    received_at TIMESTAMP NULL DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(purchase_order_id),
    FOREIGN KEY (status_id)
    REFERENCES statuses(status_id),
    FOREIGN KEY (received_by)
    REFERENCES users(user_id)
);

-- 4.22 Define delivered/accepted/rejected line quantities
-- Purpose: Creates delivery_items with per-order-item links and checks to prevent impossible
-- quantities. The supplied notes create this table but do not populate it.
-- ----------------------------------------------------------------------
CREATE TABLE delivery_items (
    delivery_item_id CHAR(36) PRIMARY KEY,
    delivery_id CHAR(36) NOT NULL,
    po_item_id CHAR(36) NOT NULL,
    delivered_quantity DECIMAL(15,3) NOT NULL,
    accepted_quantity DECIMAL(15,3) NOT NULL,
    rejected_quantity DECIMAL(15,3) NOT NULL,
    notes TEXT,
    CONSTRAINT uq_delivery_po_item
    UNIQUE (delivery_id, po_item_id),
    FOREIGN KEY (delivery_id)
    REFERENCES deliveries(delivery_id),
    FOREIGN KEY (po_item_id)
    REFERENCES purchase_order_items(po_item_id),
    CONSTRAINT chk_delivery_quantities
    CHECK (delivered_quantity > 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0 AND accepted_quantity + rejected_quantity <= delivered_quantity)
);

-- 4.23 Define the supplier-performance evaluation table
-- Purpose: Creates one evaluation per purchase order with three scores bounded between 0 and 100,
-- an evaluator FK, and optional comments. This is the application’s core supplier-evaluation
-- structure, but the source files do not include actual ratings.
-- ----------------------------------------------------------------------
CREATE TABLE supplier_evaluations (
    evaluation_id CHAR(36) PRIMARY KEY,
    purchase_order_id CHAR(36) NOT NULL UNIQUE,
    evaluated_by CHAR(36) NOT NULL,
    quality_score DECIMAL(5,2) NOT NULL,
    delivery_score DECIMAL(5,2) NOT NULL,
    service_score DECIMAL(5,2) NOT NULL,
    comments TEXT,
    evaluated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(purchase_order_id),
    FOREIGN KEY (evaluated_by)
    REFERENCES users(user_id),
    CONSTRAINT chk_quality_score
    CHECK (quality_score BETWEEN 0 AND 100),
    CONSTRAINT chk_delivery_score
    CHECK (delivery_score BETWEEN 0 AND 100),
    CONSTRAINT chk_service_score
    CHECK (service_score BETWEEN 0 AND 100)
);


-- STEP 5 - TRANSACTION INTEGRATION AND SIMULATED PROJECT CONTEXT

-- 5.1 Insert Ten Simulated Contractor Companies
-- Purpose: Inserts ten constructed contractor profiles so historical supplier transactions can be
-- placed in a multi-company project-management context. UUID() generates internal company IDs;
-- the data is synthetic.
-- ----------------------------------------------------------------------
INSERT INTO companies (company_id, company_name, email, phone, address)
VALUES
    (UUID(), 'Apex Construction Ltd.',
    'contact@apex.example.com', '212-555-0101',
    'New York, NY, USA'),
    (UUID(), 'American Build Engineering',
    'contact@americanbuild.example.com', '213-555-0102',
    'Los Angeles, CA, USA'),
    (UUID(), 'Pacific Infrastructure Group',
    'contact@pacificinfra.example.com', '415-555-0103',
    'San Francisco, CA, USA'),
    (UUID(), 'Metro Civil Contractors',
    'contact@metrocivil.example.com', '312-555-0104',
    'Chicago, IL, USA'),
    (UUID(), 'Summit Engineering',
    'contact@summitengineering.example.com', '303-555-0105',
    'Denver, CO, USA'),
    (UUID(), 'Premier Construction Group',
    'contact@premierconstruction.example.com', '713-555-0106',
    'Houston, TX, USA'),
    (UUID(), 'Atlantic Development Group',
    'contact@atlanticdev.example.com', '305-555-0107',
    'Miami, FL, USA'),
    (UUID(), 'Liberty Structural Engineering',
    'contact@libertystructural.example.com', '215-555-0108',
    'Philadelphia, PA, USA'),
    (UUID(), 'Northwest Infrastructure Works',
    'contact@northwestinfra.example.com', '206-555-0109',
    'Seattle, WA, USA'),
    (UUID(), 'Capital Construction Solutions',
    'contact@capitalconstruction.example.com', '202-555-0110',
    'Washington, DC, USA');

-- 5.2 Review Transaction Date Coverage
-- Purpose: MIN and MAX identify the earliest and latest valid transaction dates and COUNT gives
-- the transaction volume used to plan simulated project periods.
-- ----------------------------------------------------------------------
SELECT
    MIN(transaction_date) AS earliest_transaction,
    MAX(transaction_date) AS latest_transaction,
    COUNT(*) AS total_transactions
FROM cleaned_transactions;

-- 5.3 Generate One Sample Project per Transaction Year
-- Purpose: Distinct YEAR(transaction_date) values are ranked, then distributed cyclically to the
-- ten contractor companies using MOD. Each project runs from January 1 through December 31 of
-- its year and receives Project / Completed status; the notes state that 39 projects were
-- generated.
-- ----------------------------------------------------------------------
INSERT INTO projects (project_id, company_id, project_name, description, location, start_date, end_date, status_id)
SELECT
    UUID(), c.company_id,
    CONCAT('Construction Project ', y.project_year),
    'Simulated construction project for historical procurement data',
    c.address,
    STR_TO_DATE(CONCAT(y.project_year, '-01-01'), '%Y-%m-%d'),
    STR_TO_DATE(CONCAT(y.project_year, '-12-31'), '%Y-%m-%d'),
    s.status_id
FROM (
SELECT project_year, ROW_NUMBER() OVER (ORDER BY project_year) AS project_rank
FROM (
SELECT DISTINCT YEAR(transaction_date) AS project_year
FROM cleaned_transactions
    ) AS years
    ) AS y
JOIN (
SELECT company_id, address,
    ROW_NUMBER() OVER (ORDER BY company_name, company_id) AS company_rank
FROM companies
    ) AS c ON c.company_rank = MOD(y.project_rank - 1, 10) + 1
JOIN statuses s ON s.status_type = 'Project' AND s.status_name = 'Completed';

-- 5.4 Check Transaction Coverage by Project Periods
-- Purpose: NOT EXISTS searches for transactions that fall outside every project start/end period.
-- It checks date coverage, not whether each transaction has been mapped to a particular
-- project.
-- ----------------------------------------------------------------------
SELECT COUNT(*) AS uncovered_transactions
FROM cleaned_transactions t
WHERE NOT EXISTS (
SELECT 1
FROM projects p
WHERE t.transaction_date
    BETWEEN p.start_date AND p.end_date
);

-- 5.5 Generate 80 Internal Demo Users
-- Purpose: CROSS JOIN creates eight users per contractor company and CASE assigns two each of
-- Administrator, Project Manager, Site Engineer and Procurement Officer. These generated
-- names, emails, phones and demo passwords must not be treated as real personnel data.
-- ----------------------------------------------------------------------
INSERT INTO users (user_id, company_id, role_id, first_name, last_name, email, password, phone, is_active)
SELECT
    UUID(), c.company_id, r.role_id,
    CONCAT('Employee', n.employee_no),
    CONCAT('Company', c.company_no),
    CONCAT('employee', n.employee_no, '.company', c.company_no, '@example.com'),
    'Demo123!',
    CONCAT('202-555-', LPAD((c.company_no - 1) * 8 + n.employee_no + 100, 4, '0')),
    TRUE
FROM (
SELECT company_id, ROW_NUMBER() OVER (ORDER BY company_name, company_id) AS company_no
FROM companies
    ) c
CROSS JOIN (
SELECT 1 AS employee_no UNION ALL SELECT 2 UNION ALL SELECT 3
UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
UNION ALL SELECT 7 UNION ALL SELECT 8
    ) n
JOIN roles r ON r.role_name = CASE
    WHEN n.employee_no IN (1, 2) THEN 'Administrator'
    WHEN n.employee_no IN (3, 4) THEN 'Project Manager'
    WHEN n.employee_no IN (5, 6) THEN 'Site Engineer'
    WHEN n.employee_no IN (7, 8) THEN 'Procurement Officer'
    END;

-- 5.6 Change Membership Assignment Type to DATETIME
-- Purpose: ALTER TABLE changes assigned_at from TIMESTAMP to DATETIME before using project start
-- dates, which is useful for historical dates that may fall outside the valid TIMESTAMP range.
-- ----------------------------------------------------------------------
ALTER TABLE project_members
    MODIFY COLUMN assigned_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP;

-- 5.7 Associate Project Personnel with Company Projects
-- Purpose: INSERT ... SELECT links each project to users belonging to the same company, excluding
-- Administrators and including the three operational roles. assigned_at is set to the project
-- start date.
-- ----------------------------------------------------------------------
INSERT INTO project_members (project_member_id, project_id, user_id, assigned_at, updated_by)
SELECT UUID(), p.project_id, u.user_id, TIMESTAMP(p.start_date), NULL
FROM projects p
JOIN users u ON p.company_id = u.company_id
JOIN roles r ON u.role_id = r.role_id
WHERE r.role_name IN ('Project Manager', 'Site Engineer', 'Procurement Officer');

-- 5.8 Generate Six Sequential Project Activities
-- Purpose: CROSS JOIN defines six synthetic activities per project, each roughly two months long.
-- ROW_NUMBER partitions engineers by project and MOD alternates activity responsibility
-- between the two Site Engineers.
-- ----------------------------------------------------------------------
INSERT INTO project_activities (activity_id, project_id, assigned_to, status_id, activity_name, description, start_date, end_date)
SELECT
    UUID(), p.project_id, u.user_id, s.status_id, a.activity_name,
    CONCAT('Simulated construction activity: ', a.activity_name),
    DATE_ADD(p.start_date, INTERVAL (a.activity_no - 1) * 2 MONTH),
    LAST_DAY(DATE_ADD(p.start_date, INTERVAL (a.activity_no * 2 - 1) MONTH))
FROM projects p
CROSS JOIN (
SELECT 1 AS activity_no, 'Site Preparation' AS activity_name
UNION ALL SELECT 2, 'Foundation Works'
UNION ALL SELECT 3, 'Structural Works'
UNION ALL SELECT 4, 'Building Envelope'
UNION ALL SELECT 5, 'MEP Installation'
UNION ALL SELECT 6, 'Finishing and Handover') a
JOIN (
SELECT pm.project_id, pm.user_id,
    ROW_NUMBER() OVER (PARTITION BY pm.project_id ORDER BY pm.user_id) AS engineer_no
FROM project_members pm
JOIN users u ON pm.user_id = u.user_id
JOIN roles r ON u.role_id = r.role_id
WHERE r.role_name = 'Site Engineer'
    ) u ON u.project_id = p.project_id
    AND u.engineer_no = MOD(a.activity_no - 1, 2) + 1
JOIN statuses s ON s.status_type = 'Project Activity' AND s.status_name = 'Completed';

-- 5.9 Create a Transaction-to-Target ID Crosswalk
-- Purpose: etl_transaction_mapping stores each source transaction_id with a newly generated
-- requirement_id, purchase_order_id and linked activity_id. It is declared with CREATE TABLE,
-- not CREATE TEMPORARY TABLE, so it persists until explicitly removed.
-- ----------------------------------------------------------------------
CREATE TABLE etl_transaction_mapping (
    transaction_id VARCHAR(8) PRIMARY KEY,
    requirement_id CHAR(36) NOT NULL UNIQUE,
    purchase_order_id CHAR(36) NOT NULL UNIQUE,
    activity_id CHAR(36) NOT NULL,
    FOREIGN KEY (activity_id)
    REFERENCES project_activities(activity_id)
);

-- 5.10 Populate the ID Crosswalk
-- Purpose: Each cleaned transaction receives one requirement UUID and one purchase-order UUID; a
-- correlated subquery chooses a project activity whose date interval contains the transaction
-- date. ORDER BY and LIMIT 1 ensure a single selected activity when several meet the date
-- condition.
-- ----------------------------------------------------------------------
INSERT INTO etl_transaction_mapping (transaction_id, requirement_id, purchase_order_id, activity_id)
SELECT t.transaction_id, UUID(), UUID(),(
SELECT pa.activity_id FROM project_activities pa WHERE t.transaction_date BETWEEN pa.start_date AND pa.end_date ORDER BY pa.project_id, pa.activity_id LIMIT 1)
FROM cleaned_transactions t;

-- 5.11 Load Simulated Material Requirements
-- Purpose: INSERT ... SELECT combines each cleaned transaction with its crosswalk: original
-- material ID, quantity, and date become the requirement’s material, required quantity, and
-- required date.
-- ----------------------------------------------------------------------
INSERT INTO project_materials_requirements (requirement_id, material_id, activity_id, required_quantity, required_date, notes)
SELECT
    etm.requirement_id, t.material_id, etm.activity_id,
    t.quantity, t.transaction_date,
    'Simulated requirement from historical transaction'
FROM cleaned_transactions t
JOIN etl_transaction_mapping etm ON t.transaction_id = etm.transaction_id;

-- 5.12 Load One Purchase-Order Header per Transaction
-- Purpose: The mapped PO UUID becomes the internal primary key; PO- followed by original
-- transaction_id becomes the readable po_number. Supplier_id comes from the source company_id,
-- project_id comes through the chosen activity, and status is set to Completed. created_by and
-- delivery date are unspecified.
-- ----------------------------------------------------------------------
INSERT INTO purchase_orders (purchase_order_id, project_id, supplier_id, created_by, po_number, order_date, expected_delivery_date, status_id, notes)
SELECT
    etm.purchase_order_id, pa.project_id, t.company_id, NULL,
    CONCAT('PO-', t.transaction_id), t.transaction_date, NULL,
    s.status_id, 'Simulated purchase order from historical transaction'
FROM cleaned_transactions t
JOIN etl_transaction_mapping etm ON t.transaction_id = etm.transaction_id
JOIN project_activities pa ON etm.activity_id = pa.activity_id
JOIN statuses s ON s.status_type = 'Purchase Order' AND s.status_name = 'Completed';

-- 5.13 Load One Purchase-Order Line per Transaction
-- Purpose: A new po_item UUID links the order, supplier-material bridge and material requirement.
-- The ordered quantity and agreed unit price come from the source transaction. Discounts and
-- total_price are not stored in these target columns.
-- ----------------------------------------------------------------------
INSERT INTO purchase_order_items (po_item_id, purchase_order_id, supplier_material_id, requirement_id, ordered_quantity, agreed_unit_price)
SELECT
    UUID(), etm.purchase_order_id, sm.supplier_material_id,
    etm.requirement_id, t.quantity, t.price_per_unit
FROM cleaned_transactions t
JOIN etl_transaction_mapping etm ON t.transaction_id = etm.transaction_id
JOIN supplier_materials sm ON t.company_id = sm.supplier_id
    AND t.material_id = sm.material_id;

-- END OF ETL PROCESS
