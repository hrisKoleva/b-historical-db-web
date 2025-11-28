SELECT 
	PSCONO as "Company",
	PSFACI as "Facility",
	PSPRNO as "Product",
	PSSTRT as "Product structure type",
	PSSEQN as "Sequence number",
	PSRLEV as "Relative level",
	PSITTY as "Item type",
	PSSTSQ as "Structure sequence number",
	PSPRN1 as "Product",
	PSMTNO as "Component number",
	PSCNQT as "Quantity",
	PSPEUN as "Product engineering U/M",
	PSCRMA as "Critical line manufacturing",
	PSCRPU as "Critical line purchase",
	PSOPLC as "Planning method",
	PSACDB as "Cumulative lead-time offset",
	PSMDBF as "Lead time offset",
	PSSATD as "Safety time",
	PSLEAL as "Lead time this level",
	PSRGDT as "Entry date",
	PSTSTM as "Timestamp"
FROM
	MPDSUM