"use client";

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { ChatMessage, DataFile } from '../types';
import { buildAnalysisBodyContent } from '../lib/chatResponseEnvelope';
import { renderMarkdownToHtml } from '../lib/markdown';

interface ExportContext {
    sessionTitle: string;
    messages: ChatMessage[];
    activeFiles?: DataFile[];
}

interface ExportBundle {
    prompt: string;
    message: ChatMessage;
    chartNode: HTMLElement | null;
}

const PAGE = {
    width: 210,
    height: 297,
    marginX: 16,
    marginY: 18,
};

function sanitizeFilename(value: string): string {
    return value.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'report';
}

function extractPromptForMessage(messages: ChatMessage[], assistantIndex: number): string {
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === 'user') {
            return messages[index].content || '';
        }
    }
    return '';
}

function getLatestExportBundle(messages: ChatMessage[]): ExportBundle | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') continue;
        if (!message.content && !message.result?.responseEnvelope) continue;

        return {
            prompt: extractPromptForMessage(messages, index),
            message,
            chartNode: document.getElementById(`export-chart-${message.id}`),
        };
    }

    return null;
}

function markdownToPlainText(content: string): string {
    if (!content.trim()) return '';

    const html = renderMarkdownToHtml(content);
    const container = document.createElement('div');
    container.innerHTML = html;

    return (container.textContent || container.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

function ensureSpace(pdf: jsPDF, cursorY: number, requiredHeight: number): number {
    if (cursorY + requiredHeight <= PAGE.height - PAGE.marginY) {
        return cursorY;
    }

    pdf.addPage();
    return PAGE.marginY;
}

function drawPageHeader(pdf: jsPDF, title: string, subtitle?: string) {
    pdf.setFillColor(17, 24, 39);
    pdf.rect(0, 0, PAGE.width, 18, 'F');

    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(PAGE.marginX, 24, PAGE.width - (PAGE.marginX * 2), 18, 4, 4, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.text('SPARTA Executive Report', PAGE.marginX, 11.5);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(18);
    pdf.text(title, PAGE.marginX + 4, 31.5);

    if (subtitle) {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.setFontSize(9);
        pdf.text(subtitle, PAGE.marginX + 4, 37.5);
    }
}

function drawSectionTitle(pdf: jsPDF, cursorY: number, title: string): number {
    const nextY = ensureSpace(pdf, cursorY, 12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(9);
    pdf.text(title.toUpperCase(), PAGE.marginX, nextY);

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(PAGE.marginX, nextY + 2.5, PAGE.width - PAGE.marginX, nextY + 2.5);
    return nextY + 8;
}

function drawParagraph(pdf: jsPDF, cursorY: number, text: string, options?: { fontSize?: number; color?: [number, number, number]; fontStyle?: 'normal' | 'bold'; lineHeight?: number; }) {
    const fontSize = options?.fontSize ?? 11;
    const lineHeight = options?.lineHeight ?? 5.5;
    const lines = pdf.splitTextToSize(text, PAGE.width - (PAGE.marginX * 2));
    const requiredHeight = lines.length * lineHeight + 1;
    const nextY = ensureSpace(pdf, cursorY, requiredHeight);

    pdf.setFont('helvetica', options?.fontStyle ?? 'normal');
    pdf.setFontSize(fontSize);
    const [r, g, b] = options?.color ?? [31, 41, 55];
    pdf.setTextColor(r, g, b);
    pdf.text(lines, PAGE.marginX, nextY, { baseline: 'top' });

    return nextY + requiredHeight;
}

function drawNumberedList(pdf: jsPDF, cursorY: number, items: string[], accent: [number, number, number]): number {
    let nextY = cursorY;

    items.forEach((item, index) => {
        const wrapped = pdf.splitTextToSize(item, PAGE.width - (PAGE.marginX * 2) - 14);
        const blockHeight = Math.max(12, wrapped.length * 5 + 6);
        nextY = ensureSpace(pdf, nextY, blockHeight + 3);

        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(PAGE.marginX, nextY - 1.5, PAGE.width - (PAGE.marginX * 2), blockHeight, 3, 3, 'F');

        pdf.setFillColor(accent[0], accent[1], accent[2]);
        pdf.circle(PAGE.marginX + 5, nextY + 4, 3.2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text(String(index + 1), PAGE.marginX + 5, nextY + 4.8, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(10.5);
        pdf.text(wrapped, PAGE.marginX + 11.5, nextY + 1.5, { baseline: 'top' });
        nextY += blockHeight + 3;
    });

    return nextY;
}

async function captureChartImage(chartNode: HTMLElement | null): Promise<string | null> {
    if (!chartNode) return null;

    const canvas = await html2canvas(chartNode, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (doc) => {
            const clone = doc.getElementById(chartNode.id);
            if (clone) {
                (clone as HTMLElement).style.background = '#ffffff';
                (clone as HTMLElement).style.color = '#111827';
            }
            doc.body.style.background = '#ffffff';
        },
    });

    return canvas.toDataURL('image/png');
}

function addImageBlock(pdf: jsPDF, cursorY: number, imageData: string): number {
    const props = pdf.getImageProperties(imageData);
    const imageWidth = PAGE.width - (PAGE.marginX * 2);
    const imageHeight = (props.height * imageWidth) / props.width;
    const nextY = ensureSpace(pdf, cursorY, imageHeight + 4);

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(PAGE.marginX, nextY, imageWidth, imageHeight, 3, 3, 'F');
    pdf.addImage(imageData, 'PNG', PAGE.marginX, nextY, imageWidth, imageHeight);
    return nextY + imageHeight + 4;
}

export const exportToPDF = async ({ sessionTitle, messages, activeFiles = [] }: ExportContext) => {
    const bundle = getLatestExportBundle(messages);
    if (!bundle) return false;

    try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const envelope = bundle.message.result?.responseEnvelope;
        const title = sessionTitle || 'Analysis';
        const subtitle = `Prepared ${new Date().toLocaleString()}${activeFiles.length ? ` • ${activeFiles.length} active dataset${activeFiles.length === 1 ? '' : 's'}` : ''}`;
        const chartImage = await captureChartImage(bundle.chartNode);
        const executiveHeadline = envelope?.headline || markdownToPlainText(bundle.message.content).split('\n')[0] || 'Executive summary';
        const insights = envelope?.insights || [];
        const actions = envelope?.actions || [];
        const forecast = envelope?.forecast || '';
        const dataQuality = envelope?.dataQuality || '';
        const analysisBody = markdownToPlainText(buildAnalysisBodyContent(bundle.message.content, envelope));

        drawPageHeader(pdf, title, subtitle);

        let cursorY = 52;

        if (activeFiles.length > 0) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Datasets');
            cursorY = drawParagraph(pdf, cursorY, activeFiles.map((file) => file.name).join(' • '), {
                fontSize: 10,
                color: [71, 85, 105],
                lineHeight: 5,
            });
            cursorY += 2;
        }

        if (bundle.prompt) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Management Question');
            cursorY = drawParagraph(pdf, cursorY, markdownToPlainText(bundle.prompt), {
                fontSize: 10.5,
                color: [51, 65, 85],
            });
            cursorY += 2;
        }

        cursorY = drawSectionTitle(pdf, cursorY, 'Executive Signal');
        cursorY = drawParagraph(pdf, cursorY, executiveHeadline, {
            fontSize: 15,
            fontStyle: 'bold',
            color: [15, 23, 42],
            lineHeight: 7,
        });
        cursorY += 2;

        if (chartImage) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Visual Summary');
            cursorY = addImageBlock(pdf, cursorY, chartImage);
        }

        if (insights.length > 0) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Key Insights');
            cursorY = drawNumberedList(pdf, cursorY, insights, [37, 99, 235]);
        }

        if (actions.length > 0) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Recommended Actions');
            cursorY = drawNumberedList(pdf, cursorY, actions, [15, 118, 110]);
        }

        if (forecast) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Forecast');
            cursorY = drawParagraph(pdf, cursorY, forecast, {
                fontSize: 11,
                color: [31, 41, 55],
            });
            cursorY += 2;
        }

        if (dataQuality) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Data Quality');
            cursorY = drawParagraph(pdf, cursorY, dataQuality.replace(/^Data Quality:\s*/i, ''), {
                fontSize: 10.5,
                color: [71, 85, 105],
            });
            cursorY += 2;
        }

        if (analysisBody) {
            cursorY = drawSectionTitle(pdf, cursorY, 'Supporting Analysis');
            cursorY = drawParagraph(pdf, cursorY, analysisBody, {
                fontSize: 10.5,
                color: [51, 65, 85],
                lineHeight: 5.2,
            });
        }

        if (bundle.message.sources?.length) {
            cursorY = drawSectionTitle(pdf, cursorY + 1, 'Sources');
            cursorY = drawParagraph(
                pdf,
                cursorY,
                bundle.message.sources.map((source) => source.title).join(' • '),
                { fontSize: 9.5, color: [100, 116, 139], lineHeight: 4.8 }
            );
        }

        const pageCount = pdf.getNumberOfPages();
        for (let page = 1; page <= pageCount; page += 1) {
            pdf.setPage(page);
            pdf.setDrawColor(226, 232, 240);
            pdf.line(PAGE.marginX, PAGE.height - 12, PAGE.width - PAGE.marginX, PAGE.height - 12);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.text('Prepared for management review', PAGE.marginX, PAGE.height - 7.2);
            pdf.text(`Page ${page} of ${pageCount}`, PAGE.width - PAGE.marginX, PAGE.height - 7.2, { align: 'right' });
        }

        pdf.save(`SPARTA_Executive_Report_${sanitizeFilename(title)}.pdf`);
        return true;
    } catch (error) {
        console.error('PDF export failed:', error);
        return false;
    }
};
