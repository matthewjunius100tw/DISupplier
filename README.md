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

    
    %% Website Entry
    A[Digital Idea Solution <br> Website]

    %% Public Website
    subgraph Public["Public Website"]
        direction TB
        B1["Homepage"]
        B2["Solutions"]
        B3["Who We Serve"]
        B4["Pricing"]
        B5["Our Story"]
        B6["Contact Us"]
        B7["Join Our Team"]
        L["Login"]

        %% Link connecting vertical layout order
        B1 ~~~ B2 ~~~ B3 ~~~ B4 ~~~ B5 ~~~ B6 ~~~ B7 ~~~ L
    end

%% Connections
A --> Public