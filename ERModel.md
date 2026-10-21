# DISupplier - 3NF Data Model (ER Diagram)

This document defines the database schema for the DISupplier Procurement and Supplier Management Platform in 3rd Normal Form (3NF). It visually distinguishes the Minimum Viable Product (MVP / Phase 1) scope from advanced features (Phase 2/3).

```mermaid
erDiagram
    %% ==========================================
    %% Entity Relationships
    %% ==========================================
    USERS ||--o{ PROJECTS : "manages (MVP)"
    USERS ||--o{ PURCHASE_ORDERS : "approves (MVP)"
    PROJECTS ||--o{ RFQS : "belongs_to (MVP)"
    PROJECTS ||--o{ PURCHASE_ORDERS : "contains (MVP)"
    
    SUPPLIERS ||--o{ QUOTATIONS : "submits (MVP)"
    SUPPLIERS ||--o{ PURCHASE_ORDERS : "receives (MVP)"
    
    RFQS ||--o{ RFQ_ITEMS : "contains (MVP)"
    MATERIALS ||--o{ RFQ_ITEMS : "specified_in (MVP)"
    
    RFQS ||--o{ QUOTATIONS : "requested_in (MVP)"
    QUOTATIONS ||--o{ PURCHASE_ORDERS : "generated_from (MVP)"
    
    PURCHASE_ORDERS ||--|{ ORDER_ITEMS : "contains (MVP)"
    MATERIALS ||--o{ ORDER_ITEMS : "ordered_in (MVP)"
    
    PURCHASE_ORDERS ||--o{ DELIVERIES : "has_deliveries (MVP)"
    DELIVERIES ||--|{ DELIVERY_ITEMS : "includes (MVP)"
    ORDER_ITEMS ||--o{ DELIVERY_ITEMS : "fulfilled_by (MVP)"
    
    PURCHASE_ORDERS ||--o{ PAYMENTS : "tracks_payment (Phase 3)"
    USERS ||--o{ NOTIFICATIONS : "receives (Phase 3)"

    %% ==========================================
    %% Entity & 3NF Schema Definitions
    %% ==========================================
    USERS {
        int user_id PK "MVP - User ID"
        string username "MVP - Username"
        string email "MVP - Email Address"
        string role "MVP - User Role (Admin/PM/SiteStaff)"
        string status "MVP - Account Status (Active/Disabled)"
    }

    PROJECTS {
        int project_id PK "MVP - Project ID"
        string project_name "MVP - Project Name"
        string location "MVP - Construction Site Location"
        date start_date "MVP - Project Start Date"
        string status "MVP - Status (In Progress/Completed)"
        int manager_id FK "MVP - Assigned PM (USERS.user_id)"
    }

    SUPPLIERS {
        int supplier_id PK "MVP - Supplier ID"
        string company_name "MVP - Company Name"
        string contact_person "MVP - Contact Person"
        string email "MVP - Contact Email"
        string status "MVP - Status (Active/Suspended)"
        string rating "Phase 2 - Supplier Rating Score"
    }

    MATERIALS {
        int material_id PK "MVP - Material ID"
        string material_name "MVP - Material Name"
        string category "MVP - Material Category"
        string unit "MVP - Unit of Measurement (Ton/Meter/Bag)"
    }

    RFQS {
        int rfq_id PK "MVP - RFQ ID"
        int project_id FK "MVP - Associated Project ID"
        date rfq_date "MVP - RFQ Date"
        string status "MVP - Status (Draft/Sent/Closed)"
    }

    RFQ_ITEMS {
        int rfq_item_id PK "MVP - RFQ Item ID"
        int rfq_id FK "MVP - Associated RFQ ID"
        int material_id FK "MVP - Material ID"
        int target_quantity "MVP - Target Quantity"
    }

    QUOTATIONS {
        int quotation_id PK "MVP - Quotation ID"
        int rfq_id FK "MVP - Corresponding RFQ ID"
        int supplier_id FK "MVP - Supplier ID"
        decimal quoted_total "MVP - Quoted Total Amount"
        string status "MVP - Status (Submitted/Selected/Rejected)"
    }

    PURCHASE_ORDERS {
        int po_id PK "MVP - Purchase Order ID"
        string po_number "MVP - Purchase Order Number"
        int project_id FK "MVP - Associated Project ID"
        int supplier_id FK "MVP - Supplier ID"
        int quotation_id FK "MVP - Associated Quotation ID (Nullable)"
        int created_by FK "MVP - Created By (USERS.user_id)"
        decimal total_amount "MVP - Total Amount"
        string status "MVP - Status (Draft/Approved/Cancelled)"
        date created_at "MVP - Creation Date"
    }

    ORDER_ITEMS {
        int po_item_id PK "MVP - PO Item ID"
        int po_id FK "MVP - Associated PO ID"
        int material_id FK "MVP - Material ID"
        int quantity "MVP - Order Quantity"
        decimal unit_price "MVP - Agreed Unit Price"
    }

    DELIVERIES {
        int delivery_id PK "MVP - Delivery Record ID"
        int po_id FK "MVP - Associated PO ID"
        date delivery_date "MVP - Delivery Date"
        string receiver_name "MVP - Receiver Name"
        string status "MVP - Status (Received/Partial/Rejected)"
    }

    DELIVERY_ITEMS {
        int delivery_item_id PK "MVP - Delivery Item ID"
        int delivery_id FK "MVP - Associated Delivery ID"
        int po_item_id FK "MVP - Corresponding PO Item ID"
        int qty_received "MVP - Quantity Received"
        int qty_damaged "MVP - Quantity Damaged/Rejected"
    }

    PAYMENTS {
        int payment_id PK "Phase 3 - Payment Record ID"
        int po_id FK "Phase 3 - Associated PO ID"
        decimal amount "Phase 3 - Payment Amount"
        date payment_date "Phase 3 - Payment Date"
        string status "Phase 3 - Status (Paid/Pending)"
    }

    NOTIFICATIONS {
        int notification_id PK "Phase 3 - Notification ID"
        int user_id FK "Phase 3 - Recipient User ID"
        string message "Phase 3 - Message Content"
        timestamp sent_at "Phase 3 - Timestamp Sent"
    }
```
