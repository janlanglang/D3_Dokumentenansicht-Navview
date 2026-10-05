SELECT
	record.id,
	'$P{tabelle}' AS tabelle,
	(
		SELECT
			fs.doku_id AS D3DocumentId,
			CONVERT(nvarchar(max), pd.[text]) AS Beschreibung,
			fs.dok_dat_feld_29 AS Sprache,
			fs.dok_dat_feld_30 AS Revision,
			pd.size_in_byte AS SizeInBytes
		FROM dbo.firmen_spezifisch_d3 AS fs
		JOIN dbo.phys_datei_d3 AS pd ON pd.doku_id = fs.doku_id
		WHERE pd.datei_erw <> 'FOL'
		  AND UPPER(LTRIM(RTRIM(fs.dok_dat_feld_11))) = UPPER('$P{tabelle}')
		  AND fs.dok_dat_feld_80 = CONVERT(varchar(30), record.id)
		FOR JSON PATH, INCLUDE_NULL_VALUES
	) AS d3metadata,
	(
		SELECT DISTINCT DMSDOCUMENTTYPEREF.DMSDOCUMENTTYPE AS DMSDOCUMENTTYPE
		FROM ASDEFINITION
		JOIN DMSDOCUMENTTYPEREF ON DMSDOCUMENTTYPEREF.asdefinition = ASDEFINITION.definition
		WHERE UPPER(LTRIM(RTRIM(ASDEFINITION.TABELLE))) = UPPER('$P{tabelle}')
		FOR JSON PATH, INCLUDE_NULL_VALUES
	) AS d3types
FROM $P{tabelle} AS record
WHERE record.id = $P{id}