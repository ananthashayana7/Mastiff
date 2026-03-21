"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2 } from 'lucide-react';

interface PlotlyRendererProps {
    data: any;
}

export const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (!chartRef.current || !data) return;

        // Load Plotly from CDN if not present
        if (!(window as any).Plotly) {
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-2.35.0.min.js';
            script.async = true;
            script.onload = () => {
                setIsLoaded(true);
                renderChart();
            };
            document.head.appendChild(script);
        } else {
            setIsLoaded(true);
            renderChart();
        }

        function renderChart() {
            if (!(window as any).Plotly || !chartRef.current) return;

            // Deep merge layout for Mastiff dark theme
            const layout = {
                ...data.layout,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(10,10,10,0.5)',
                font: {
                    color: '#a1a1a1',
                    family: 'IBM Plex Sans, system-ui, sans-serif',
                    size: 11
                },
                margin: { t: 40, r: 20, l: 50, b: 50 },
                autosize: true,
                xaxis: {
                    ...(data.layout?.xaxis || {}),
                    gridcolor: '#1a1a1a',
                    zerolinecolor: '#222',
                    linecolor: '#1a1a1a',
                    tickfont: { color: '#555', size: 10 }
                },
                yaxis: {
                    ...(data.layout?.yaxis || {}),
                    gridcolor: '#1a1a1a',
                    zerolinecolor: '#222',
                    linecolor: '#1a1a1a',
                    tickfont: { color: '#555', size: 10 }
                },
                legend: {
                    ...(data.layout?.legend || {}),
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
            const traces = (data.data || []).map((trace: any, i: number) => {
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

            (window as any).Plotly.newPlot(chartRef.current, traces, layout, {
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
                displaylogo: false,
                toImageButtonOptions: {
                    format: 'png',
                    filename: `mastiff-plotly-${Date.now()}`,
                    scale: 2
                }
            });
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

    return (
        <div className={`glass rounded-2xl overflow-hidden shadow-2xl animate-fade-in transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/30">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] animate-pulse" />
                    <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-[2px]">Interactive Chart</span>
                </div>
                <div className="flex gap-1.5">
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-all">
                        {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    <button onClick={handleExport} className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-all">
                        <Download size={12} />
                    </button>
                </div>
            </div>

            {/* Chart Area */}
            <div className={`w-full ${isExpanded ? 'h-[calc(100vh-120px)]' : 'h-[400px]'} p-2`}>
                {!isLoaded && (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Loading Plotly...</span>
                        </div>
                    </div>
                )}
                <div ref={chartRef} className="w-full h-full" />
            </div>
        </div>
    );
};
