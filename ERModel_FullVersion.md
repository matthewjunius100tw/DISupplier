# DISupplier 

## Full Version - 3NF Data Model (ER Diagram)

### Description:

This document defines the Full Version database schema for the DISupplier Procurement and Supplier Management Platform in 3rd Normal Form (3NF), extending the existing procurement workflow with unified status management, notifications, financial and accounting records, supplier performance reporting, and predictive analysis.

```mermaid
erDiagram

        %%Entity Relationships

        %%Introduction Relationship
        COMPANIES ||--o{ USERS: "employs"
        COMPANIES ||--o{ PROJECTS: "manages"
        COMPANIES ||--o{ COMPANY_SUPPLIERS: "has"   
        SUPPLIERS ||--o{ COMPANY_SUPPLIERS: "belongs_to"
        ROLES ||--o{ USERS: "assigned_to"
        
        %%Project Management
        PROJECTS ||--o{ PROJECT_MEMBERS: "contains"
        USERS ||--o{ PROJECT_MEMBERS: "assigned_to"
        USERS ||--o{ PROJECT_ACTIVITIES: "assigned_to"
        PROJECTS ||--o{ PROJECT_ACTIVITIES: "contains"
        STATUSES ||--o{ PROJECTS: "defines"
        STATUSES ||--o{ PROJECT_ACTIVITIES: "defines"
        
        %%Material Management
        MATERIAL_CATEGORIES ||--o{ MATERIALS: "categorizes"
        SUPPLIERS ||--o{ SUPPLIER_MATERIALS: "offers"
        MATERIALS ||--o{ SUPPLIER_MATERIALS: "is_offered_by"
        MATERIALS ||--o{ PROJECT_MATERIALS_REQUIREMENTS: "specifies"
        PROJECT_ACTIVITIES |o--o{ PROJECT_MATERIALS_REQUIREMENTS: "requires"
        USERS |o--o{ PROJECT_MATERIALS_REQUIREMENTS: "updates"

        %%RFQ Management
        USERS ||--o{ RFQS: "creates"
        PROJECTS ||--o{ RFQS: "has"
        RFQS ||--o{ RFQ_SUPPLIERS: "sent_to"
        SUPPLIERS ||--o{ RFQ_SUPPLIERS: "receives"
        RFQS ||--o{ RFQ_ITEMS: "contains"
        PROJECT_MATERIALS_REQUIREMENTS ||--o{ RFQ_ITEMS: "included_in"
        STATUSES ||--o{ RFQS: "defines"
        STATUSES ||--o{ RFQ_SUPPLIERS: "defines"

        %%Quotation Management
        RFQ_SUPPLIERS ||--o{ QUOTATIONS: "responds_with"
        QUOTATIONS ||--|{ QUOTATION_ITEMS: "contains"
        RFQ_ITEMS ||--o{ QUOTATION_ITEMS: "quoted_in"
        STATUSES ||--o{ QUOTATIONS: "defines"

        %%Purchase Order Management
        QUOTATIONS ||--|{ PURCHASE_ORDERS: "generates"
        PURCHASE_ORDERS ||--|{ PURCHASE_ORDER_ITEMS: "contains"
        QUOTATION_ITEMS ||--o{ PURCHASE_ORDER_ITEMS: "purchased_as"
        STATUSES ||--o{ PURCHASE_ORDERS: "defines"

        %%Delivery Management
        PURCHASE_ORDERS ||--|{ DELIVERIES: "fulfilled_by"
        STATUSES ||--o{ DELIVERIES: "defines"
        USERS |o--o{ DELIVERIES: "receives"
        DELIVERIES ||--|{ DELIVERY_ITEMS: "contains"
        PURCHASE_ORDER_ITEMS ||--|{ DELIVERY_ITEMS: "delivered_as"

        %%Supplier Evaluation Management
        PURCHASE_ORDERS ||--o| SUPPLIER_EVALUATIONS: "evaluated_by"
        USERS ||--o{ SUPPLIER_EVALUATIONS: "submits"

        %%Notification Management
        USERS |o--o{ NOTIFICATIONS: "receives"
        SUPPLIERS |o--o{ NOTIFICATIONS: "receives"

        %%Supplier Performance Reporting and Prediction
        COMPANIES ||--o{ SUPPLIER_PERFORMANCE_REPORTS: "generates"
        SUPPLIERS ||--o{ SUPPLIER_PERFORMANCE_REPORTS: "analyzed_in"
        USERS |o--o{ SUPPLIER_PERFORMANCE_REPORTS: "generates"
        SUPPLIER_PERFORMANCE_REPORTS ||--o{ SUPPLIER_PERFORMANCE_PREDICTIONS: "predicts"
        
        %%Entity Definition
        COMPANIES {
            uuid company_id PK "Company unique identifier"
            varchar(150) company_name  "Registered company name"
            varchar(255) email "Company's official email address"
            varchar(30) phone "Company's phone number"
            text address "Company's registered address"
            bool is_active "Indicates whether the company account is active"
            timestamp created_at "Company registration timestamp"
            timestamp updated_at "Last company information update timestamp"
        }

        USERS {
            uuid user_id PK "User unique identifier"
            uuid company_id FK "Company unique identifier"
            uuid role_id FK "Assigned role"
            varchar(100) first_name "User's first name"
            varchar(100) last_name "User's last name"
            varchar(255) email "Email used for login"
            varchar(255) password "Secured password"
            varchar(30) phone "User's phone number"
            bool is_active "Indicates whether the account is active"
            timestamp created_at "Account creation timestamp"
            timestamp updated_at "Last account update timestamp"
        }

        PROJECTS {
            uuid project_id PK "Projet unique identifier"
            uuid company_id FK "Company unique identifier"
            varchar(50) project_name "Name of the construction project"
            text description "Description of the project"
            text location "Construction project location"
            date start_date "Planned project start date"
            date end_date "Planned project completion date"
            varchar(20) status "Current status of the project"
            timestamp created_at "Project creation timestamp"
            timestamp updated_at "Last project update timestamp"
        }

        SUPPLIERS {
            uuid supplier_id PK "Supplier unique identifier"
            varchar(150) supplier_name "Registered supplier name"
            varchar(255) email "Supplier's official email address"
            varchar(255) password "Secured password"
            varchar(30) phone "Supplier's registered phone number"
            text address "Supplier's registered address"
            varchar(255) website "Supplier's website"
            bool is_active "Indicates whether the supplier is active"
            timestamp created_at "Supplier creation timestamp"
            timestamp updated_at "Last supplier update timestamp"
        }

        MATERIALS {
            uuid material_id PK "Material unique identifier"
            uuid category_id FK "Material category unique identifier"
            varchar(150) material_name "Name of construction material"
            text specification "Technical specification of material"
            varchar(30) unit "Unit of measurement"
            bool is_active "Indicates whether the material is active"
            timestamp created_at "Materials creation timestamp"
            timestamp updated_at "Last material update timestamp"
        }

        COMPANY_SUPPLIERS {
            uuid company_supplier_id PK "Relationship unique identifier"
            uuid company_id FK "Company unique identifier"
            uuid supplier_id FK "Supplier unique identifier"
            timestamp created_at "Company supplier registration date"
            timestamp updated_at "Last company supplier updated timestamp"
            bool is_active "Indicates whether relationship is active"
        }

        SUPPLIER_MATERIALS {
            uuid supplier_material_id PK "Relationship unique identifier"
            uuid supplier_id FK "Supplier offering the material"
            uuid material_id FK "Material offered by supplier"
            bool is_available "Indicates whether material is available"
            timestamp created_at "Supplier material registration date"
            timestamp updated_at "Last supplier material updated timestamp"
        }

        PROJECT_MATERIALS_REQUIREMENTS {
            uuid requirement_id PK "Material requirement unique identifier"
            uuid material_id FK "Required construction material"
            uuid activity_id FK "Associated project activity"
            decimal(15,3) required_quantity "Quantity of material required"
            date required_date "Date when material is needed"
            text notes "Additional material requirement details"
            timestamp created_at "Requirement creation timestamp"
            timestamp updated_at "Last requirement update timestamp"
            uuid updated_by FK "Employee who last updated the requirement"
        }

        ROLES {
            uuid role_id PK "Role unique identifier"
            varchar(50) role_name "Employee role's name"
            text description "Description of the role and responsibilities"
        }

        PROJECT_MEMBERS {
            uuid project_member_id PK "Unique identifier for each project assignment"
            uuid project_id FK "Project unique identifier"
            uuid user_id FK "User unique identifier"
            timestamp assigned_at "Date and time the employee assigned"
            timestamp updated_at "Date and time the project last modified"
            uuid updated_by FK "The employee who last modified the assignment"
        }

        PROJECT_ACTIVITIES {
            uuid activity_id PK "Activity unique identifier"
            uuid project_id FK "Project unique identifier"
            uuid assigned_to FK "Employee PIC"
            uuid status_id FK "Current activity status"
            varchar(150) activity_name "Construction activity name"
            text description "Description of the activity"
            date start_date "Planned activity start date"
            date end_date "Planned activity end date"
            timestamp created_at "Activity creation timestamp"
            timestamp updated_at "Last activity update timestamp"
            uuid updated_by FK "Employee who last updated the activity"
        }

        MATERIAL_CATEGORIES {
            uuid category_id PK "Material category unique identifier"
            varchar(100) category_name "Unique material category name"
            text description "Description of material category name"
            bool is_active "Indicates whether category is active"
            timestamp created_at "Category creation timestamp"
            timestamp updated_at "Last category update timestamp"
        }

        RFQS {
            uuid rfq_id PK "RFQ unique identifier"
            uuid project_id "Project requesting the quotation"
            uuid created_by "Employee created RFQ"
            varchar(50) rfq_number "Unique RFQ reference number"
            date issued_date "Date RFQ issued"
            date deadline "Quotation submission deadline"
            uuid status FK "Current RFQ status"
            text notes "Additional RFQ information"
            timestamp created_at "RFQ creation timestamp"
            timestamp updated_at "Last RFQ update timestamp"
        }

        RFQ_ITEMS {
            uuid rfq_item_id PK "RFQ item unique identifier"
            uuid rfq_id FK "Associated request for quotation"
            uuid requirement_id FK "Associated project material requirement"
            decimal(15,3) requested_quantity "Quantity requested from supllier"
            text notes "Additional RFQ item information"
        }

        RFQ_SUPPLIERS {
            uuid rfq_supplier_id PK "RFQ supplier invitation identifier"
            uuid rfq_id FK "Associated request for quotation"
            uuid supplier_id FK "Supplier receiving the RFQ"
            timestamp sent_at "Date and time RFQ sent"
            uuid response_status FK "Current invitation response status"
        }

        QUOTATIONS {
            uuid quotation_id PK "Quotation unique identifier"
            uuid rfq_supplier_id FK "Associated supplier RFQ invitation"
            varchar(50) quotation_number "Supplier quotation reference"
            date quotation_date "Quotation submission date"
            date valid_until "Quotation validity deadline"
            uuid status "Current quotation status"
            text notes "Quotation terms and remarks"
            timestamp created_at "Quotation creation timestamp"
            timestamp updated_at "Last quotation update timestamp"
        }

        QUOTATION_ITEMS {
            uuid quotation_item_id PK "Quotation item unique identifier"
            uuid quotation_id FK "Associated quotation"
            uuid rfq_item_id FK "Corresponding requested material"
            decimal(15,3) quoted_quantity "Quantity offered by supplier"
            decimal(15,3) unit_price "Quoted price per material unit"
            text notes "Additional quotation item details"
        }


        PURCHASE_ORDERS {
            uuid purchase_order_id PK "Purchase order unique identifiers"
            uuid quotation_id FK "Source approved quotation"
            uuid created_by FK "Employee who created purchase order"
            varchar(30) po_number "Unique purchase order reference"
            date order_date "Purchase order issuance date"
            date expected_delivery_date "Expected material delivery date"
            uuid status FK "Current purchase order status"
            text notes "Additional purchase order information"
            timestamp created_at "Purchase order creation timestamp"
            timestamp updated_at "Last purchase order update timestamp"
        }

        PURCHASE_ORDER_ITEMS {
            uuid po_item_id PK "Purchase order item unique identifier"
            uuid purchase_order_id FK "Associated purchase order"
            uuid quotation_item_id FK "Source quotation item"
            decimal(15,3) ordered_quantity "Quantity orderded from supplier"
            decimal(15,3) agreed_unit_price "Agreed purchase price per unit"
        }

        PURCHASE_ORDER_STATUS {
            uuid po_status_id PK "Purchase order status unique identifier"
            varchar(30) status_name "Name of purchase order status"
            text description "Description of purchase order status"
        }

        DELIVERIES {
            uuid delivery_id PK "Delivery unique identifier"
            uuid purchase_order_id FK "Associated purchase order"
            uuid delivery_status_id FK "Current delivery status"
            uuid received_by FK "Employee who received delivery"
            varchar(30) delivery_number "Unique delivery reference"
            date scheduled_date "Scheduled material delivery date"
            timestamp actual_arrival_at "Actual delivery timestamp"
            timestamp received_at "Material receiving timestamp"
            text notes "Delivery remarks or issues"
            timestamp created_at "Delivery record creation timestamp"
            timestamp updated_at "Last delivery update timestamp"
        }

        DELIVERY_ITEMS {
            uuid delivery_item_id PK "Delivery item unique identifier"
            uuid delivery_id FK "Associated delivery"
            uuid po_item_id FK "Associated purchase order item"
            decimal(15,3) delivered_quantity "Quantity physically delivered"
            decimal(15,3) accepted_quantity "Quantity accepted at site"
            decimal(15,3) rejected_quantity "Quantity rejected at site"
            text notes "Delivery item remarks"
        }

        SUPPLIER_EVALUATIONS {
            uuid evaluation_id PK "Supplier evaluation unique identifier"
            uuid purchase_order_id FK "Purchase order being evaluated"
            uuid evaluated_by FK "Employee performing evaluation"
            decimal(4,2) quality_score "Material quality evaluation score"
            decimal(4,2) delivery_score "Delivery timeliness evaluation score"
            decimal(4,2) service_score "Supplier service evaluation score"
            text comments "Additional evaluation remarks"
            timestamp evaluated_at "Evaluation submission timestamp"
        }

        SUPPLIER_PERFORMANCE_REPORTS {
            uuid report_id PK "Supplier performance report identifier"
            uuid company_id FK "Company requesting performance analysis"
            uuid supplier_id FK "Supplier being analyzed"
            uuid generated_by FK "Employee generating report if applicable"
            date period_start "Beginning of reporting period"
            date period_end "End of reporting period"
            int evaluated_orders_count "Number of orders used in report"
            decimal(4,2) average_quality_score "Average evaluated material quality score"
            decimal(4,2) average_delivery_score "Average evaluated delivery score"
            decimal(4,2) average_service_score "Average evaluated service score"
            decimal(4,2) overall_score "Composite supplier performance score"
            decimal(5,2) on_time_delivery_rate "On time delivery percentage"
            timestamp generated_at "Report generation timestamp"
        }

        SUPPLIER_PERFORMANCE_PREDICTIONS {
            uuid prediction_id PK "Supplier performance prediction identifier"
            uuid report_id FK "Source supplier performance report"
            varchar(50) prediction_target "Metric being predicted"
            decimal(10,4) predicted_value "Predicted value for selected metric"
            varchar(30) prediction_unit "Unit of the predicted metric"
            decimal(5,4) confidence_score "Prediction confidence if available"
            date forecast_end_date "Forecast period ending date"
            varchar(100) model_name "Prediction algorithm or model name"
            varchar(50) model_version "Model version used for prediction"
            timestamp generated_at "Prediction generation timestamp"
        }

        NOTIFICATIONS {
            uuid notification_id PK "Notification unique identifier"
            uuid user_id FK "Employee recipient if applicable"
            uuid supplier_id FK "Supplier recipient if applicable"
            uuid status_id FK "Current notification status"
            varchar(50) notification_type "Event type such as RFQ or payment"
            varchar(150) title "Notification title"
            text message "Notification message"
            timestamp created_at "Notification creation timestamp"
            timestamp read_at "Notification read timestamp"
        }

        INVOICES {
            uuid invoice_id PK "Invoice unique identifier"
            uuid purchase_order_id FK "Purchase order being invoiced"
            uuid status_id FK "Current invoice status"
            varchar(50) invoice_number "Supplier invoice reference number"
            date invoice_date "Invoice issuance date"
            date due_date "Payment due date"
            text notes "Additional invoice remarks"
            timestamp created_at "Invoice creation timestamp"
            timestamp updated_at "Last invoice update timestamp"
        }

        INVOICE_ITEMS {
            uuid invoice_item_id PK "Invoice item unique identifier"
            uuid invoice_id FK "Associated supplier invoice"
            uuid po_item_id FK "Associated purchase order item"
            decimal(15,3) billed_quantity "Quantity charged by supplier"
            decimal(15,2) unit_price "Invoiced unit price"
            text notes "Additional invoice item remarks"
        }

        PAYMENTS {
            uuid payment_id PK "Payment unique identifier"
            uuid invoice_id FK "Invoice being paid"
            uuid recorded_by FK "Employee recording payment"
            uuid status_id FK "Current payment status"
            varchar(50) payment_number "Unique payment reference number"
            date payment_date "Date payment was made"
            decimal(15,2) amount "Amount paid toward invoice"
            varchar(30) payment_method "Method used to make payment"
            varchar(100) transaction_reference "Bank or payment transaction reference"
            text notes "Additional payment remarks"
            timestamp created_at "Payment creation timestamp"
            timestamp updated_at "Last payment update timestamp"
        }

        STATUSES {
            uuid status_id PK "Status unique identifier"
            varchar(50) status_type "Project, Project Activity, Purchase Order, Delivery, RFQ, Payments, Quotations"
            varchar(30) status_name "Name of the status"
            text description "Description of the status"
        }




