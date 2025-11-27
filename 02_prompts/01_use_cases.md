
Use case #01 - CUSTOMER ORDERS

1. FIND customers by
Table OCUSMA
Columns:
- CUSTOMER_NUMBER - OKCUNO 
- FULL_NAME - OKCUNM 
- PHONE - OKPHNO 
- KW_REFERENCE - OKOREF 
- VAT - OKVTCD 

1.1. SHOW CUSTOMER_ORDER_NUMBER
Table OOHEAD
Columns:
-!! OAORNO - Customer order number
- OACUNO - Customer number
- OAOFNO - Quotation number
- OAOREF - Our Reference
-!! OACUOR - Customer order number
- OAPROJ - Project Number


1.1.1 For each customer order SHOW CUSTOMER_ORDER_LINE_NUMBER
Table OOLINE
Columns:
- OBORNO - Customer order number
- OBPONR - Order Line Number
- OBITNO - Item number
- OBITDS - Item Name
- OBCUNO - Customer
- OBCUOR - Customer order number
- OBPRNO - Product (number)
- 


1.1.1.1 For each customer order line number SHOW BOM
Table MCBOMS
Columns:
KUITNO - Item Number
KUMTNO - Component Number
