# DISupplier
### Description: 

DISupplier is a web-based supplier and procurement management platform developed to help construction companies improve the management of suppliers, procurement processes, quotations, purchase orders, deliveries, and supplier performance across multiple construction projects. The software was developed by Digital Idea Solution Co., Ltd. as a solution to reduce fragmented procurement processes and improve coordination, visibility, and decision-making within construction projects.

### Developers:
| Name | Student ID |
| ----- | ---------- |
| Ambrosius Matthew Junius Reynaldo | D11505806 |
| 林宗群 | M11505501 |
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

    %% Public Website
    subgraph Public["Public Website"]
        direction TB
        B1["Homepage<br>(Matthew)"]
        B2["Solutions<br>(Matthew)"]
        B3["Who We Serve<br>(林宗群)"]
        B4["Pricing<br>(林宗群)"]
        B5["Our Story<br>(Matthew)"]
        B6["Contact Us<br>(林宗群)"]
        B7["Join Our Team<br>(林宗群)"]
        L["Login<br>(Matthew)"]

        %% Link connecting vertical layout order
        B1 ~~~ B2 ~~~ B3 ~~~ B4 ~~~ B5 ~~~ B6 ~~~ B7 ~~~ L
    end

%% DISupplier Core Platform Subgraph (Post-login)
    subgraph CoreSystem["DISupplier Core Platform"]
        C1["Dashboard & Projects<br>(林宗群)"]
        C2["Project Management<br>(林宗群)"]
        C3["Supplier Management<br>(Matthew)"]
        C4["Procurement Management<br>(Matthew)"]
        C5["Quotation Management<br>(林宗群)"]
        C6["Purchase Order Management<br>(林宗群)"]
        C7["Delivery Management<br>(Matthew)"]
        C8["Supplier Performance Evaluation<br>(Matthew)"]

        %% Link connecting vertical layout order
        C1 ~~~ C2 ~~~ C3 ~~~ C4 ~~~ C5 ~~~ C6 ~~~ C7 ~~~ C8
    end
%% Connections
A --> Public
L --> CoreSystem

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