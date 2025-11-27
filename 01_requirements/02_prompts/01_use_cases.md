
**Use case #01 - CUSTOMER ORDERS**

1. FIND customers by
**Table OCUSMA**
Columns:
- CUSTOMER_NUMBER - OKCUNO 
- FULL_NAME - OKCUNM 
- PHONE - OKPHNO 
- KW_REFERENCE - OKOREF 
- VAT - OKVTCD 

1.1. SHOW CUSTOMER_ORDER_NUMBER
**Table OOHEAD**
Columns:
-!! OAORNO - order number (westad ref?!)
- OACUNO - Customer number
- OAOFNO - Quotation number
- OAOREF - Our Reference
-!! OACUOR - Customer order number
- OAPROJ - Project Number
- 

1.1.1 For each customer order SHOW CUSTOMER_ORDER_LINE_NUMBER
**Table OOLINE**
Columns:
- OBORNO - Customer order number
- OBPONR - Order Line Number
- OBITNO - Item number
- OBITDS - Item Name
- OBTEDS - Technical Description 
- OBCUNO - Customer
- OBCUOR - Customer order number
- OBPRNO - Product (number)

1.1.1.1 For each Item number show 
**from table MITMAS"**
- MMITNO - Item number
- MMITDS - Item description
- MMFUDS - Additional descritpion
- MMDWNO - Drawing number
- MMSUNO - Supplier number

1.1.1.1 For each customer order line number SHOW BOM
**Table MCBOMS**
Columns:
KUITNO - Item Number
KUMTNO - Component Number
.....

# Use case #02 - Suppliers
1. FIND Supplier by
**from table CIDMAS**
- IDSUNO - Supplier number
- IDSUNM - Supplier name
- IDPHNO - Suppllier phone number

2. For each supplier show its address from CIDARD
- 

# User case 03 - Purchase orders
from table MPHEAD
- IAPUNO - Purchase order number
- IASUNO - Supplier number
- 





