import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';

/**
 * Export Service
 * 
 * Handles exporting data in multiple formats: CSV, Excel, PDF
 */

export interface ExportOptions {
  filename?: string;
  title?: string;
  timestamp?: boolean;
}

export interface TableData {
  headers: string[];
  rows: any[][];
  metadata?: {
    totalRows?: number;
    exportedAt?: string;
    query?: string;
  };
}

export class ExportService {
  /**
   * Export data to CSV format
   */
  static async toCSV(data: TableData, options: ExportOptions = {}): Promise<Buffer> {
    try {
      const csv = this.generateCSV(data, options);
      return Buffer.from(csv, 'utf-8');
    } catch (error) {
      console.error('CSV export failed:', error);
      throw new Error('Failed to export to CSV');
    }
  }

  /**
   * Export data to Excel format (.xlsx)
   */
  static async toExcel(data: TableData, options: ExportOptions = {}): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Data');

      // Add title if provided
      if (options.title) {
        worksheet.mergeCells('A1:' + this.getColumnLetter(data.headers.length) + '1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = options.title;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center', vertical: 'center' };
        worksheet.insertRows(1, 1);
      }

      // Add headers
      const headerRow = worksheet.addRow(data.headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'center' };

      // Add data rows
      data.rows.forEach((row) => {
        const worksheetRow = worksheet.addRow(row);
        worksheetRow.alignment = { horizontal: 'left', wrapText: true };

        // Format numbers with 2 decimals if applicable
        row.forEach((cell, index) => {
          if (typeof cell === 'number' && !Number.isInteger(cell)) {
            worksheetRow.getCell(index + 1).numFmt = '0.00';
          }
        });
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? cell.value.toString().length : 0;
          maxLength = Math.max(maxLength, cellLength);
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Add metadata sheet if provided
      if (data.metadata) {
        const metaSheet = workbook.addWorksheet('Metadata');
        metaSheet.addRow(['Export Time', data.metadata.exportedAt || new Date().toISOString()]);
        metaSheet.addRow(['Total Rows', data.metadata.totalRows || data.rows.length]);
        metaSheet.addRow(['Query', data.metadata.query || 'N/A']);
        metaSheet.columns[0].width = 20;
        metaSheet.columns[1].width = 40;
      }

      // Write to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as Buffer;
    } catch (error) {
      console.error('Excel export failed:', error);
      throw new Error('Failed to export to Excel');
    }
  }

  /**
   * Export data to PDF format
   */
  static async toPDF(data: TableData, options: ExportOptions = {}): Promise<Buffer> {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      // Add title
      const title = options.title || 'Data Export Report';
      doc.setFontSize(16);
      doc.text(title, 14, 20);

      // Add metadata
      if (options.timestamp) {
        doc.setFontSize(10);
        doc.text(`Exported: ${new Date().toLocaleString()}`, 14, 30);
      }

      // Add table
      autoTable(doc, {
        head: [data.headers],
        body: data.rows,
        startY: options.timestamp ? 40 : 35,
        theme: 'grid',
        headStyles: {
          fillColor: [54, 96, 146],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: this.getColumnStyles(data.headers.length),
        margin: 10,
        didDrawPage: (data) => {
          // Footer
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.getHeight();
          const pageWidth = pageSize.getWidth();
          doc.setFontSize(9);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
          );
        },
      });

      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('PDF export failed:', error);
      throw new Error('Failed to export to PDF');
    }
  }

  /**
   * Export data to JSON format
   */
  static async toJSON(data: TableData, options: ExportOptions = {}): Promise<Buffer> {
    try {
      const jsonData = {
        title: options.title || 'Data Export',
        exportedAt: new Date().toISOString(),
        metadata: data.metadata,
        data: data.rows.map((row) => {
          const obj: Record<string, any> = {};
          data.headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        }),
      };

      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      console.error('JSON export failed:', error);
      throw new Error('Failed to export to JSON');
    }
  }

  /**
   * Generate CSV content
   */
  private static generateCSV(data: TableData, options: ExportOptions): string {
    try {
      const records = data.rows.map((row) => {
        const obj: Record<string, any> = {};
        data.headers.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });

      const parser = new Parser({
        fields: data.headers,
        quote: '"',
        escape: '"',
      });

      return parser.parse(records);
    } catch (error) {
      console.error('CSV generation failed:', error);
      throw error;
    }
  }

  /**
   * Get column styles for PDF
   */
  private static getColumnStyles(columnCount: number): Record<number, any> {
    const styles: Record<number, any> = {};
    for (let i = 0; i < columnCount; i++) {
      styles[i] = { halign: i === 0 ? 'left' : 'center', cellWidth: 'auto' };
    }
    return styles;
  }

  /**
   * Convert number to Excel column letter
   */
  private static getColumnLetter(num: number): string {
    let letter = '';
    while (num > 0) {
      const temp = (num - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      num = Math.floor((num - 1) / 26);
    }
    return letter;
  }

  /**
   * Get MIME type for export format
   */
  static getMimeType(format: 'csv' | 'excel' | 'pdf' | 'json'): string {
    const types: Record<string, string> = {
      csv: 'text/csv',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      json: 'application/json',
    };
    return types[format] || 'application/octet-stream';
  }

  /**
   * Get file extension
   */
  static getFileExtension(format: 'csv' | 'excel' | 'pdf' | 'json'): string {
    const extensions: Record<string, string> = {
      csv: '.csv',
      excel: '.xlsx',
      pdf: '.pdf',
      json: '.json',
    };
    return extensions[format] || '.bin';
  }
}
