"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, Filter } from 'lucide-react';

interface PlotlyRendererProps {
    data: any;
}

export const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);

    useEffect(() => {
        if (!chartRef.current || !data) return;
        setRenderError(null);

        // Load Plotly from CDN if not present
        if (!(window as any).Plotly) {
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-2.35.0.min.js';
            script.async = true;
            script.onload = () => {
                setIsLoaded(true);
                renderChart();
            };
            script.onerror = () => {
                setRenderError('Failed to load Plotly runtime. Check network or ad-block settings.');
            };
            document.head.appendChild(script);
        } else {
            setIsLoaded(true);
            renderChart();
        }

        function renderChart() {
            if (!(window as any).Plotly || !chartRef.current) return;

            let parsedData: any = data;
            try {
                if (typeof parsedData === 'string') {
                    parsedData = JSON.parse(parsedData);
                }
            } catch {
                setRenderError('Received invalid chart payload.');
                return;
            }

            if (!parsedData) {
                setRenderError('No chart payload found.');
                return;
            }

            const rawTraces = Array.isArray(parsedData)
                ? parsedData
                : Array.isArray(parsedData.data)
                    ? parsedData.data
                    : [];

            if (rawTraces.length === 0) {
                setRenderError('Chart payload has no plottable traces.');
                return;
            }

            // Deep merge layout for Mastiff dark theme
            const layout = {
                ...(parsedData.layout || {}),
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(10,10,10,0.5)',
                font: {
                    color: '#a1a1a1',
                    family: 'IBM Plex Sans, system-ui, sans-serif',
                    size: 11
                },
                margin: {
                    t: parsedData.layout?.margin?.t ?? (parsedData.layout?.title ? 48 : 24),
                    r: parsedData.layout?.margin?.r ?? 24,
                    l: parsedData.layout?.margin?.l ?? 56,
                    b: parsedData.layout?.margin?.b ?? 48,
                },
                autosize: true,
                xaxis: {
                    ...(parsedData.layout?.xaxis || {}),
                    gridcolor: '#1a1a1a',
                    zerolinecolor: '#222',
                    linecolor: '#1a1a1a',
                    tickfont: { color: '#555', size: 10 },
                    rangeslider: parsedData.layout?.xaxis?.rangeslider ?? { visible: false },
                },
                yaxis: {
                    ...(parsedData.layout?.yaxis || {}),
                    gridcolor: '#1a1a1a',
                    zerolinecolor: '#222',
                    linecolor: '#1a1a1a',
                    tickfont: { color: '#555', size: 10 }
                },
                legend: {
                    ...(parsedData.layout?.legend || {}),
                    font: { color: '#888', size: 10 },
                    bgcolor: 'rgba(0,0,0,0)'
                },
                colorway: ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52'],
                hoverlabel: {
                    bgcolor: '#0a0a0a',
                    bordercolor: '#333',
                    font: { color: '#fff', size: 11, family: 'IBM Plex Sans' }
                }
            };

            // Respect intrinsic colorscales and categorical color maps (e.g., heatmaps, pies).
            const traces = rawTraces.map((trace: any, i: number) => {
                const colors = ['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52'];
                const traceType = String(trace?.type || '').toLowerCase();
                const keepIntrinsicColor = [
                    'heatmap',
                    'contour',
                    'surface',
                    'choropleth',
                    'treemap',
                    'sunburst',
                    'icicle',
                    'funnelarea',
                    'pie',
                ].includes(traceType);

                if (keepIntrinsicColor) {
                    return trace;
                }

                return {
                    ...trace,
                    marker: {
                        ...(trace.marker || {}),
                        color: trace.marker?.color || colors[i % colors.length],
                    },
                    line: {
                        ...(trace.line || {}),
                        color: trace.line?.color || colors[i % colors.length],
                    }
                };
            });

            try {
                (window as any).Plotly.newPlot(chartRef.current, traces, layout, {
                    responsive: true,
                    displayModeBar: true,
                    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                    modeBarButtonsToAdd: ['hoverclosest', 'hovercompare'],
                    displaylogo: false,
                    scrollZoom: true,
                    toImageButtonOptions: {
                        format: 'png',
                        filename: `mastiff-plotly-${Date.now()}`,
                        scale: 2
                    }
                });
            } catch (error: any) {
                setRenderError(error?.message || 'Plotly render failed');
            }
        }

        return () => {
            if ((window as any).Plotly && chartRef.current) {
                try { (window as any).Plotly.purge(chartRef.current); } catch { }
            }
        };
    }, [data]);

    // Re-render when expanded
    useEffect(() => {
        if (isLoaded && chartRef.current && (window as any).Plotly) {
            (window as any).Plotly.Plots.resize(chartRef.current);
        }
    }, [isExpanded, isLoaded]);

    const handleExport = () => {
        if (!chartRef.current || !(window as any).Plotly) return;
        (window as any).Plotly.downloadImage(chartRef.current, {
            format: 'png',
            width: 1200,
            height: 800,
            filename: `mastiff-chart-${Date.now()}`,
            scale: 2
        });
    };

    const handleResetZoom = () => {
        if (!chartRef.current || !(window as any).Plotly) return;
        (window as any).Plotly.relayout(chartRef.current, {
            'xaxis.autorange': true,
            'yaxis.autorange': true,
        });
    };

    return (
        <div className={`w-full rounded-2xl overflow-hidden border border-zinc-800/60 bg-zinc-900/20 shadow-xl animate-fade-in transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/40">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] animate-pulse" />
                    <span className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2.5px]">Interactive Chart</span>
                </div>
                <div className="flex gap-1.5">
                    <button onClick={handleResetZoom} title="Reset zoom" className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all">
                        <Filter size={12} />
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all">
                        {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    <button onClick={handleExport} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all">
                        <Download size={12} />
                    </button>
                </div>
            </div>

            {/* Chart Area — height driven by chart's own layout.height, else 560px default */}
            <div className={`w-full ${isExpanded ? 'h-[calc(100vh-120px)]' : ''}`}
                style={!isExpanded ? { height: (() => { try { const p = typeof data === 'string' ? JSON.parse(data) : data; return p?.layout?.height ? `${Math.max(Number(p.layout.height), 400)}px` : '560px'; } catch { return '560px'; } })() } : {}}>
                {!isLoaded && (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Loading chart...</span>
                        </div>
                    </div>
                )}
                {renderError && (
                    <div className="w-full h-full flex items-center justify-center p-4">
                        <div className="text-[10px] text-red-400 font-semibold text-center">{renderError}</div>
                    </div>
                )}
                <div ref={chartRef} className="w-full h-full" />
            </div>
        </div>
    );
};
