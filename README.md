# DISupplier
### Description: 

DISupplier is a web-based supplier and procurement management platform developed to help construction companies improve the management of suppliers, procurement processes, quotations, purchase orders, deliveries, and supplier performance across multiple construction projects. The software was developed by Digital Idea Solution Co., Ltd. as a solution to reduce fragmented procurement processes and improve coordination, visibility, and decision-making within construction projects.

### Developers:
| Name | Student ID |
| ----- | ---------- |
| Ambrosius Matthew Junius Reynaldo | D11505806 |
| 林宗群 | M11505501 |

### Planned Website:

This is the organizational chart for Digital Idea Solution Website and DISupplier

```mermaid

flowchart LR

    %% Style Definition
    classDef highPriority fill:#ff9999,stroke:#333,stroke-width:2px,color:#fff; 
    classDef medPriority fill:#ffcc99,stroke:#333,stroke-width:2px,color:#fff; 
    classDef lowPriority fill:#99ccff,stroke:#333,stroke-width:2px,color:#fff;

    %% Website Entry
    A[Digital Idea Solution <br> Website]

    %% Public Website (B for Public)
    subgraph Public["Public Website"]
        direction TB
        B1["Homepage<br>(Matthew)"]
        B2["Solutions<br>(Matthew)"]
        B3["Who We Serve<br>(林宗群)"]
        B4["Pricing<br>(林宗群)"]
        B5["Our Story<br>(Matthew)"]
        L["Login<br>(Matthew)"]
        B6["Contact Us<br>(林宗群)"]
        B7["Join Our Team<br>(林宗群)"]
    
    end

%% DISupplier Core Platform Subgraph (Post-Login)
    subgraph CoreSystem["DISupplier Core Platform"]
        direction TB
        C1["Dashboard<br>(林宗群)"]

        C2["User Management<br>(林宗群)"]
        C2_1["Create User<br>(林宗群)"]
        C2_2["Assign User Roles<br>(林宗群)"]
        C2_3["View User<br>(林宗群)"]
        C2_4["Edit User<br>(林宗群)"]
        C2_5["Change Permissions<br>(林宗群)"]
        C2_6["Deactivate User<br>(林宗群)"]

        C3["Project Management<br>(林宗群)"]
        C3_1["Create Project<br>(林宗群)"]
        C3_2["View Project<br>(林宗群)"]
        C3_3["Edit Project<br>(林宗群)"]
        C3_4["List Projects<br>(林宗群)"]
        C3_5["Assign Project Manager and Team<br>(林宗群)"]
        
        C4["Supplier Management<br>(Matthew)"]
        C4_1["Add Supplier<br>(Matthew)"]
        C4_2["View Supplier<br>(Matthew)"]
        C4_3["Edit Supplier<br>(Matthew)"]
        C4_4["List Suppliers<br>(Matthew)"]
        C4_5["Suspend/Deactivate Supplier<br>(Matthew)"]
        C4_6["Manage Supplier Company Profile<br>(Matthew)"]

        C5["Procurement and Quotation Management<br>(Matthew)"]
        C5_1["Manage RFQ<br>(Matthew)"]
        C5_2["Manage Quotation<br>(Matthew)"]
        C5_3["Manage Purchase Order<br>(Matthew)"]

        C6["Site Operation Management<br>(Matthew)"]
        C6_1["Manage Material Delivery<br>(Matthew)"]
        C6_2["Manage Site Requirements<br>(Matthew)"]

        C7["Material Management<br>(林宗群)"]
        C7_1["Add Material<br>(林宗群)"]
        C7_2["View Material<br>(林宗群)"]
        C7_3["Edit Material<br>(林宗群)"]
        C7_4["List MaterialS<br>(林宗群)"]

        C8["Supplier Performance Evaluation<br>(Matthew)"]
        C8_1["Basic Report<br>(Matthew)"]
        C8_2["Advance Predictive Analysis<br>(Matthew)"]

        C9["Financial Management<br>(林宗群)"]


    end

%% Connections
A --> Public

L --> C1

C1 --> C2
C1 --> C3
C1 --> C4
C1 --> C5
C1 --> C6
C1 --> C7
C1 --> C8
C1 --> C9

C2 --> C2_1
C2 --> C2_2
C2 --> C2_3
C2 --> C2_4
C2 --> C2_5
C2 --> C2_6

C3 --> C3_1
C3 --> C3_2
C3 --> C3_3
C3 --> C3_4
C3 --> C3_5

C4 --> C4_1
C4 --> C4_2
C4 --> C4_3
C4 --> C4_4
C4 --> C4_5
C4 --> C4_6

C5 --> C5_1
C5 --> C5_2
C5 --> C5_3

C6 --> C6_1
C6 --> C6_2

C7 --> C7_1
C7 --> C7_2
C7 --> C7_3
C7 --> C7_4

C8 --> C8_1
C8 --> C8_2

%% Priority Legend 
    subgraph Legend [Priority Legend]
    direction TB
    P1["High Priority - MVP Core"]
    P2["Medium Priority - Phase 2"]
    P3["Low Priority - Phase 3"]
    end

%% Assign Classes to Nodes 
class B1,L,C1,C2,C3,C4,P1 highPriority; 
class B2,B4,C6,C7,P2 medPriority;
class B3,B5,B6,B7,C5,C8,P3 lowPriority;
