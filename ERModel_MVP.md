# DISupplier 

## MVP - 3NF Data Model (ER Diagram)

### Description:

This document defines the database schema for the DISupplier Procurement and Supplier Management Platform, designed in accordance with Third Normal Form (3NF). This Entity-Relationship (ER) Diagram is specifically developed for the Minimum Viable Product (MVP / Phase 1), focusing on the core functionalities of project management, material management, supplier management, procurement, delivery tracking, and supplier performance evaluation.

```mermaid
erDiagram
    %%Entity Relationships
    
    %%Introduction Relationship
    COMPANIES ||--o{ USERS: "employs"
    COMPANIES ||--o{ PROJECTS: "manages"
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

    %%Purchase Order Management
    STATUSES ||--o{ PURCHASE_ORDERS: "defines"
    PROJECTS ||--o{ PURCHASE_ORDERS: "orders_for"
    SUPPLIERS ||--o{ PURCHASE_ORDERS: "receives"
    PURCHASE_ORDERS ||--|{ PURCHASE_ORDER_ITEMS: "contains"
    SUPPLIER_MATERIALS ||--o{ PURCHASE_ORDER_ITEMS: "purchased_as"
    PROJECT_MATERIALS_REQUIREMENTS ||--o{ PURCHASE_ORDER_ITEMS: "fulfills"

    %%Delivery Management
    PURCHASE_ORDERS ||--|{ DELIVERIES: "fulfilled_by"
    STATUSES ||--o{ DELIVERIES: "defines"
    USERS |o--o{ DELIVERIES: "receives"
    DELIVERIES ||--|{ DELIVERY_ITEMS: "contains"
    PURCHASE_ORDER_ITEMS ||--|{ DELIVERY_ITEMS: "delivered_as"
        
    %%Supplier Evaluation Management
    PURCHASE_ORDERS ||--o| SUPPLIER_EVALUATIONS: "evaluated_by"
    USERS ||--o{ SUPPLIER_EVALUATIONS: "submits"

    %% Entity Definitions

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

    ROLES {
        uuid role_id PK "Role unique identifier"
        varchar(50) role_name "Employee role's name"
        text description "Description of the role and responsibilities"
    }

    PROJECTS {
        uuid project_id PK "Projet unique identifier"
        uuid company_id FK "Company unique identifier"
        varchar(50) project_name "Name of the construction project"
        text description "Description of the project"
        text location "Construction project location"
        date start_date "Planned project start date"
        date end_date "Planned project completion date"
        uuid status_id FK "Current status of the project"
        timestamp created_at "Project creation timestamp"
        timestamp updated_at "Last project update timestamp"
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

    SUPPLIER_MATERIALS {
        uuid supplier_material_id PK "Relationship unique identifier"
        uuid supplier_id FK "Supplier offering the material"
        uuid material_id FK "Material offered by supplier"
        decimal(15,3) unit_price "Current listed price per material unit"
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

    PURCHASE_ORDERS {
        uuid purchase_order_id PK "Purchase order unique identifiers"
        uuid project_id FK "Project placing the order"
        uuid supplier_id FK "Supplier receiving the order"
        uuid created_by FK "Employee who created purchase order"
        varchar(30) po_number "Unique purchase order reference"
        date order_date "Purchase order issuance date"
        date expected_delivery_date "Expected material delivery date"
        uuid status_id FK "Current purchase order status"
        text notes "Additional purchase order information"
        timestamp created_at "Purchase order creation timestamp"
        timestamp updated_at "Last purchase order update timestamp"
    }

    PURCHASE_ORDER_ITEMS {
        uuid po_item_id PK "Purchase order item unique identifier"
        uuid purchase_order_id FK "Associated purchase order"
        uuid supplier_material_id FK "Selected supplier material listing"
        uuid requirement_id FK "Project material requirement being purchased"
        decimal(15,3) ordered_quantity "Quantity orderded from supplier"
        decimal(15,3) agreed_unit_price "Agreed purchase price per unit"
    }

    DELIVERIES {
        uuid delivery_id PK "Delivery unique identifier"
        uuid purchase_order_id FK "Associated purchase order"
        uuid status_id FK "Current delivery status"
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

    STATUSES {
        uuid status_id PK "Status unique identifier"
        varchar(50) status_type "Project, Project Activity, Purchase Order, or Delivery"
        varchar(30) status_name "Name of the status"
        text description "Description of the status"
    }
```
