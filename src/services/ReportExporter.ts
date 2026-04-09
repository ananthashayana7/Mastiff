"use client";

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const exportToPDF = async (containerId: string, sessionTitle: string) => {
    const element = document.getElementById(containerId);
    if (!element) return;

    try {
        const plotly = (window as any).Plotly;
        const plotNodes = Array.from(element.querySelectorAll('.js-plotly-plot')) as any[];
        const container = element as HTMLElement;
        const originalContainerStyle = {
            background: container.style.background,
            color: container.style.color,
            overflow: container.style.overflow,
            height: container.style.height,
            maxHeight: container.style.maxHeight,
        };

        const exportOverridesByNode = new Map<any, Record<string, any>>();
        const axisColorKeys = ['gridcolor', 'zerolinecolor', 'linecolor'];
        const tickFontKeys = ['color'];
        const titleFontKeys = ['color'];

        const applyExportTheme = async () => {
            container.style.background = '#ffffff';
            container.style.color = '#111827';

            if (!plotly || plotNodes.length === 0) return;

            for (const graphDiv of plotNodes) {
                const layout = graphDiv?.layout || {};
                const overrides: Record<string, any> = {
                    paper_bgcolor: '#ffffff',
                    plot_bgcolor: '#f8fafc',
                    'font.color': '#111827',
                    'legend.font.color': '#111827',
                    'title.font.color': '#0f172a',
                    'hoverlabel.bgcolor': '#ffffff',
                    'hoverlabel.font.color': '#111827',
                    'hoverlabel.bordercolor': '#cbd5e1',
                };

                const restores: Record<string, any> = {
                    paper_bgcolor: layout.paper_bgcolor,
                    plot_bgcolor: layout.plot_bgcolor,
                    'font.color': layout.font?.color,
                    'legend.font.color': layout.legend?.font?.color,
                    'title.font.color': layout.title?.font?.color,
                    'hoverlabel.bgcolor': layout.hoverlabel?.bgcolor,
                    'hoverlabel.font.color': layout.hoverlabel?.font?.color,
                    'hoverlabel.bordercolor': layout.hoverlabel?.bordercolor,
                };

                for (const [key, value] of Object.entries(layout)) {
                    if (!/^xaxis\d*$|^yaxis\d*$/.test(key) || !value || typeof value !== 'object') {
                        continue;
                    }

                    for (const axisKey of axisColorKeys) {
                        const path = `${key}.${axisKey}`;
                        restores[path] = value[axisKey];
                    }
                    for (const fontKey of tickFontKeys) {
                        const path = `${key}.tickfont.${fontKey}`;
                        restores[path] = value.tickfont?.[fontKey];
                    }
                    for (const fontKey of titleFontKeys) {
                        const path = `${key}.title.font.${fontKey}`;
                        restores[path] = value.title?.font?.[fontKey];
                    }

                    overrides[`${key}.gridcolor`] = '#d7dee8';
                    overrides[`${key}.zerolinecolor`] = '#cbd5e1';
                    overrides[`${key}.linecolor`] = '#cbd5e1';
                    overrides[`${key}.tickfont.color`] = '#475569';
                    overrides[`${key}.title.font.color`] = '#111827';
                }

                exportOverridesByNode.set(graphDiv, restores);
                await plotly.relayout(graphDiv, overrides);
            }
        };

        const restoreTheme = async () => {
            container.style.background = originalContainerStyle.background;
            container.style.color = originalContainerStyle.color;
            container.style.overflow = originalContainerStyle.overflow;
            container.style.height = originalContainerStyle.height;
            container.style.maxHeight = originalContainerStyle.maxHeight;

            if (!plotly || exportOverridesByNode.size === 0) return;

            for (const [graphDiv, restores] of exportOverridesByNode.entries()) {
                await plotly.relayout(graphDiv, restores);
            }
        };

        let canvas: HTMLCanvasElement;
        await applyExportTheme();
        container.style.overflow = 'visible';
        container.style.height = 'auto';
        container.style.maxHeight = 'none';

        try {
            canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                width: Math.max(element.scrollWidth, element.clientWidth),
                height: Math.max(element.scrollHeight, element.clientHeight),
                windowWidth: Math.max(element.scrollWidth, element.clientWidth),
                windowHeight: Math.max(element.scrollHeight, element.clientHeight),
                onclone: (clonedDocument) => {
                    const clonedTarget = clonedDocument.getElementById(containerId);
                    if (clonedTarget) {
                        (clonedTarget as HTMLElement).style.background = '#ffffff';
                        (clonedTarget as HTMLElement).style.color = '#111827';
                        (clonedTarget as HTMLElement).style.overflow = 'visible';
                        (clonedTarget as HTMLElement).style.height = 'auto';
                        (clonedTarget as HTMLElement).style.maxHeight = 'none';
                    }
                    clonedDocument.body.style.background = '#ffffff';
                    clonedDocument.body.style.color = '#111827';
                },
                ignoreElements: (el: any) => {
                    return el.tagName === 'HEADER' || el.classList.contains('input-area');
                }
            });
        } finally {
            await restoreTheme();
        }

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        // Header Bar
        pdf.setFillColor(229, 9, 20); // Mastiff Red
        pdf.rect(0, 0, pdfWidth, 18, 'F');

        // Logo area with gradient effect
        pdf.setFillColor(180, 7, 16);
        pdf.rect(0, 0, 50, 18, 'F');

        // Title
        pdf.setFontSize(16);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text('MASTIFF', 8, 12);

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text('INTELLIGENCE REPORT', 38, 12);

        // Session info
        pdf.setFontSize(7);
        pdf.setTextColor(255, 200, 200);
        pdf.text(`Session: ${sessionTitle}`, pdfWidth - 10, 8, { align: 'right' });
        pdf.text(`Generated: ${new Date().toLocaleString()}`, pdfWidth - 10, 13, { align: 'right' });

        // Separator
        pdf.setDrawColor(229, 9, 20);
        pdf.setLineWidth(0.5);
        pdf.line(10, 22, pdfWidth - 10, 22);

        // Content
        const contentStartY = 26;
        const maxHeight = pdf.internal.pageSize.getHeight() - contentStartY - 20;

        if (pdfHeight <= maxHeight) {
            pdf.addImage(imgData, 'PNG', 5, contentStartY, pdfWidth - 10, pdfHeight);
        } else {
            // Multi-page support
            let remainingHeight = pdfHeight;
            let currentY = contentStartY;
            let pageNum = 1;

            while (remainingHeight > 0) {
                const sliceHeight = pageNum === 1 ? maxHeight : pdf.internal.pageSize.getHeight() - 30;
                const sourceY = (pdfHeight - remainingHeight) / pdfHeight * imgProps.height;
                const sourceH = sliceHeight / pdfHeight * imgProps.height;

                // Create a canvas slice
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = canvas.width;
                sliceCanvas.height = Math.min(sourceH, canvas.height - sourceY);
                const ctx = sliceCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
                    const sliceData = sliceCanvas.toDataURL('image/png');
                    const targetY = pageNum === 1 ? contentStartY : 15;
                    pdf.addImage(sliceData, 'PNG', 5, targetY, pdfWidth - 10, sliceHeight);
                }

                remainingHeight -= sliceHeight;
                if (remainingHeight > 0) {
                    pdf.addPage();
                    pageNum++;
                    // Page header on subsequent pages
                    pdf.setFillColor(20, 20, 20);
                    pdf.rect(0, 0, pdfWidth, 10, 'F');
                    pdf.setFontSize(6);
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`MASTIFF REPORT — ${sessionTitle} — Page ${pageNum}`, pdfWidth / 2, 7, { align: 'center' });
                }
            }
        }

        // Footer on last page
        const lastPageH = pdf.internal.pageSize.getHeight();
        pdf.setFillColor(20, 20, 20);
        pdf.rect(0, lastPageH - 12, pdfWidth, 12, 'F');
        pdf.setFontSize(6);
        pdf.setTextColor(80, 80, 80);
        pdf.text('Generated by Mastiff AI — Data Intelligence Platform', pdfWidth / 2, lastPageH - 5, { align: 'center' });

        pdf.save(`Mastiff_Report_${sessionTitle.replace(/\s+/g, '_')}.pdf`);

        return true;
    } catch (error) {
        console.error("PDF Export failed:", error);
        return false;
    }
};
