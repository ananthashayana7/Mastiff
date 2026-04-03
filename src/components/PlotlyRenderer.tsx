"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, RotateCcw } from 'lucide-react';

interface PlotlyRendererProps {
    data: any;
}

export const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [rangePreset, setRangePreset] = useState<'ALL' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y'>('ALL');
    const [pointWindow, setPointWindow] = useState<'all' | '24' | '60' | '120'>('all');
    const [maWindow, setMaWindow] = useState<'off' | '20' | '50'>('off');
    const [useLogScale, setUseLogScale] = useState(false);
    const [normalizeSeries, setNormalizeSeries] = useState(false);
    const [showRangeSlider, setShowRangeSlider] = useState(true);
    const [showVolume, setShowVolume] = useState(true);
    const [showVWAP, setShowVWAP] = useState(false);
    const [showBollinger, setShowBollinger] = useState(false);
    const [showRSI, setShowRSI] = useState(false);
    const [priceView, setPriceView] = useState<'candles' | 'line'>('candles');

    const MASTIFF_COLORWAY = [
        '#E50914', '#2EC4B6', '#F4D35E', '#4EA8DE', '#EE964B',
        '#9B5DE5', '#00BBF9', '#06D6A0', '#FF6B6B', '#C4B5FD'
    ];

    const parsedPayload = useMemo(() => {
        try {
            if (!data) return null;
            if (typeof data === 'string') return JSON.parse(data);
            return data;
        } catch {
            return null;
        }
    }, [data]);

    const hasXAxisSeries = useMemo(() => {
        const traces = Array.isArray(parsedPayload)
            ? parsedPayload
            : Array.isArray(parsedPayload?.data)
                ? parsedPayload.data
                : [];
        return traces.some((trace: any) => Array.isArray(trace?.x) && trace.x.length > 2);
    }, [parsedPayload]);

    const isDateLikeSeries = useMemo(() => {
        const traces = Array.isArray(parsedPayload)
            ? parsedPayload
            : Array.isArray(parsedPayload?.data)
                ? parsedPayload.data
                : [];
        const sampleTrace = traces.find((trace: any) => Array.isArray(trace?.x) && trace.x.length >= 3);
        if (!sampleTrace?.x) return false;

        const sample = sampleTrace.x.slice(0, 10);
        const parsedCount = sample.filter((value: any) => {
            if (value instanceof Date) return true;
            if (typeof value === 'number') return value > 946684800000; // year 2000+ as ms timestamp
            if (typeof value !== 'string') return false;
            return !Number.isNaN(Date.parse(value));
        }).length;

        return parsedCount >= Math.ceil(sample.length * 0.6);
    }, [parsedPayload]);

    const hasOHLCSeries = useMemo(() => {
        const traces = Array.isArray(parsedPayload)
            ? parsedPayload
            : Array.isArray(parsedPayload?.data)
                ? parsedPayload.data
                : [];
        return traces.some((trace: any) => {
            const type = String(trace?.type || '').toLowerCase();
            return type === 'candlestick' || type === 'ohlc' || (
                Array.isArray(trace?.open)
                && Array.isArray(trace?.high)
                && Array.isArray(trace?.low)
                && Array.isArray(trace?.close)
            );
        });
    }, [parsedPayload]);

    const hasVolumeSeries = useMemo(() => {
        const traces = Array.isArray(parsedPayload)
            ? parsedPayload
            : Array.isArray(parsedPayload?.data)
                ? parsedPayload.data
                : [];
        return traces.some((trace: any) => {
            const maybeName = String(trace?.name || '').toLowerCase();
            return maybeName.includes('volume') || maybeName.includes('vol') || Array.isArray(trace?.volume);
        });
    }, [parsedPayload]);

    const marketMode = hasOHLCSeries;
    const volumePanelEnabled = marketMode && showVolume;
    const rsiPanelEnabled = marketMode && showRSI;
    const vwapEnabled = marketMode && showVWAP;
    const bollingerEnabled = marketMode && showBollinger;

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

            const parsedData: any = parsedPayload;
            if (!parsedData) {
                setRenderError('Received invalid chart payload.');
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

            const toDateMs = (value: any): number | null => {
                if (value instanceof Date) return value.getTime();
                if (typeof value === 'number') {
                    return value > 1e12 ? value : value * 1000;
                }
                if (typeof value !== 'string') return null;
                const parsed = Date.parse(value);
                return Number.isNaN(parsed) ? null : parsed;
            };

            const resolveStartIndex = (xValues: any[]): number => {
                if (!Array.isArray(xValues) || xValues.length < 2) return 0;

                if (isDateLikeSeries && rangePreset !== 'ALL') {
                    const timeline = xValues
                        .map((value, index) => ({ index, ms: toDateMs(value) }))
                        .filter((entry) => entry.ms !== null) as Array<{ index: number; ms: number }>;

                    if (timeline.length > 2) {
                        const latestMs = timeline[timeline.length - 1].ms;
                        const now = new Date(latestMs);

                        let cutoff = 0;
                        switch (rangePreset) {
                            case '1W':
                                cutoff = latestMs - (7 * 24 * 60 * 60 * 1000);
                                break;
                            case '1M':
                                cutoff = latestMs - (30 * 24 * 60 * 60 * 1000);
                                break;
                            case '3M':
                                cutoff = latestMs - (90 * 24 * 60 * 60 * 1000);
                                break;
                            case '6M':
                                cutoff = latestMs - (180 * 24 * 60 * 60 * 1000);
                                break;
                            case 'YTD':
                                cutoff = new Date(now.getFullYear(), 0, 1).getTime();
                                break;
                            case '1Y':
                                cutoff = latestMs - (365 * 24 * 60 * 60 * 1000);
                                break;
                            default:
                                cutoff = 0;
                        }

                        const firstInRange = timeline.find((entry) => entry.ms >= cutoff);
                        if (firstInRange) {
                            return firstInRange.index;
                        }
                    }
                }

                if (pointWindow !== 'all') {
                    const take = Math.max(2, Number(pointWindow));
                    return Math.max(0, xValues.length - take);
                }

                return 0;
            };

            const applyDurationFilter = (trace: any) => {
                if (!Array.isArray(trace?.x) || trace.x.length < 2) {
                    return trace;
                }

                const start = resolveStartIndex(trace.x);
                const next: any = { ...trace };

                const keysToSlice = ['x', 'y', 'z', 'text', 'hovertext', 'customdata', 'ids', 'open', 'high', 'low', 'close', 'volume'];
                for (const key of keysToSlice) {
                    if (Array.isArray(next[key])) {
                        next[key] = next[key].slice(start);
                    }
                }

                if (Array.isArray(next?.marker?.color) && next.marker.color.length === trace.x.length) {
                    next.marker = {
                        ...next.marker,
                        color: next.marker.color.slice(start),
                    };
                }

                return next;
            };

            const durationFilteredTraces = rawTraces.map((trace: any) => applyDurationFilter(trace));

            const maybeNormalizeTrace = (trace: any) => {
                if (!normalizeSeries || !Array.isArray(trace?.y)) {
                    return trace;
                }

                const numeric = trace.y.map((v: any) => Number(v));
                const baseline = numeric.find((v: number) => Number.isFinite(v));
                if (!Number.isFinite(baseline) || baseline === 0) {
                    return trace;
                }

                return {
                    ...trace,
                    y: numeric.map((value: number) => Number.isFinite(value) ? ((value / baseline) - 1) * 100 : value),
                    hovertemplate: `${trace?.name || 'Series'}<br>%{x}<br>Change: %{y:.2f}%<extra></extra>`,
                };
            };

            const normalizedTraces = durationFilteredTraces.map((trace: any) => maybeNormalizeTrace(trace));

            const addMovingAverageTrace = (traces: any[]) => {
                if (maWindow === 'off') return traces;

                const windowSize = Number(maWindow);
                if (!Number.isFinite(windowSize) || windowSize < 2) return traces;

                const anchorTrace = traces.find((trace: any) => Array.isArray(trace?.x) && Array.isArray(trace?.y) && trace.y.length >= windowSize);
                if (!anchorTrace) return traces;

                const y = anchorTrace.y.map((v: any) => Number(v));
                const x = anchorTrace.x;
                const ma: Array<number | null> = [];

                for (let idx = 0; idx < y.length; idx += 1) {
                    if (idx < windowSize - 1) {
                        ma.push(null);
                        continue;
                    }
                    const segment = y.slice(idx - windowSize + 1, idx + 1).filter((v: number) => Number.isFinite(v));
                    if (segment.length === 0) {
                        ma.push(null);
                    } else {
                        ma.push(segment.reduce((sum: number, value: number) => sum + value, 0) / segment.length);
                    }
                }

                const maTrace = {
                    type: 'scatter',
                    mode: 'lines',
                    name: `MA ${windowSize}`,
                    x,
                    y: ma,
                    line: {
                        color: '#F97316',
                        width: 2,
                        dash: 'dot',
                    },
                    hovertemplate: '%{x}<br>MA: %{y:.2f}<extra></extra>',
                };

                return [...traces, maTrace];
            };

            const withMovingAverage = addMovingAverageTrace(normalizedTraces);

            const computeSMA = (values: number[], window: number): Array<number | null> => {
                const out: Array<number | null> = [];
                for (let i = 0; i < values.length; i += 1) {
                    if (i < window - 1) {
                        out.push(null);
                        continue;
                    }
                    const seg = values.slice(i - window + 1, i + 1).filter((v) => Number.isFinite(v));
                    out.push(seg.length ? seg.reduce((sum, v) => sum + v, 0) / seg.length : null);
                }
                return out;
            };

            const computeRSI = (values: number[], period = 14): Array<number | null> => {
                if (values.length < period + 1) return values.map(() => null);
                const out: Array<number | null> = Array(values.length).fill(null);
                let gains = 0;
                let losses = 0;

                for (let i = 1; i <= period; i += 1) {
                    const delta = values[i] - values[i - 1];
                    if (delta >= 0) gains += delta;
                    else losses += Math.abs(delta);
                }

                let avgGain = gains / period;
                let avgLoss = losses / period;
                out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

                for (let i = period + 1; i < values.length; i += 1) {
                    const delta = values[i] - values[i - 1];
                    const gain = Math.max(delta, 0);
                    const loss = Math.max(-delta, 0);

                    avgGain = ((avgGain * (period - 1)) + gain) / period;
                    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
                    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
                }

                return out;
            };

            const buildTradingTraces = (traces: any[]) => {
                if (!hasOHLCSeries) return traces;

                const priceTrace = traces.find((trace: any) => {
                    const type = String(trace?.type || '').toLowerCase();
                    return type === 'candlestick' || type === 'ohlc' || Array.isArray(trace?.close);
                });
                if (!priceTrace) return traces;

                const detectedVolume = traces.find((trace: any) => {
                    const maybeName = String(trace?.name || '').toLowerCase();
                    return maybeName.includes('volume') || maybeName.includes('vol') || Array.isArray(trace?.volume);
                });

                const x = Array.isArray(priceTrace?.x) ? priceTrace.x : [];
                const close = Array.isArray(priceTrace?.close)
                    ? priceTrace.close.map((v: any) => Number(v))
                    : Array.isArray(priceTrace?.y)
                        ? priceTrace.y.map((v: any) => Number(v))
                        : [];

                const base = traces.filter((trace: any) => trace !== priceTrace && trace !== detectedVolume);
                const pricePanelTrace = priceView === 'line'
                    ? {
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Close',
                        x,
                        y: close,
                        line: { color: '#E50914', width: 2.2 },
                        yaxis: 'y',
                    }
                    : {
                        ...priceTrace,
                        yaxis: 'y',
                    };

                const output = [pricePanelTrace, ...base];

                if (bollingerEnabled && close.length > 20) {
                    const mid = computeSMA(close, 20);
                    const stdSeries = close.map((_v: number, i: number) => {
                        if (i < 19) return null;
                        const seg = close.slice(i - 19, i + 1).filter((v: number) => Number.isFinite(v));
                        if (seg.length < 2) return null;
                        const mean = seg.reduce((sum, v) => sum + v, 0) / seg.length;
                        const variance = seg.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / seg.length;
                        return Math.sqrt(variance);
                    });

                    const upper = mid.map((m, i) => (m === null || stdSeries[i] === null) ? null : m + (stdSeries[i] as number) * 2);
                    const lower = mid.map((m, i) => (m === null || stdSeries[i] === null) ? null : m - (stdSeries[i] as number) * 2);

                    output.push(
                        {
                            type: 'scatter',
                            mode: 'lines',
                            name: 'BB Mid',
                            x,
                            y: mid,
                            line: { color: '#60A5FA', width: 1.6 },
                            yaxis: 'y',
                        },
                        {
                            type: 'scatter',
                            mode: 'lines',
                            name: 'BB Upper',
                            x,
                            y: upper,
                            line: { color: '#34D399', width: 1.2, dash: 'dot' },
                            yaxis: 'y',
                        },
                        {
                            type: 'scatter',
                            mode: 'lines',
                            name: 'BB Lower',
                            x,
                            y: lower,
                            line: { color: '#F59E0B', width: 1.2, dash: 'dot' },
                            yaxis: 'y',
                            fill: 'tonexty',
                            fillcolor: 'rgba(96, 165, 250, 0.08)',
                        }
                    );
                }

                if (volumePanelEnabled) {
                    const volumeY = Array.isArray(detectedVolume?.y)
                        ? detectedVolume.y.map((v: any) => Number(v))
                        : Array.isArray(priceTrace?.volume)
                            ? priceTrace.volume.map((v: any) => Number(v))
                            : [];

                    if (volumeY.length === close.length && volumeY.length > 0) {
                        output.push({
                            type: 'bar',
                            name: 'Volume',
                            x,
                            y: volumeY,
                            marker: { color: 'rgba(125, 211, 252, 0.45)' },
                            yaxis: 'y2',
                            opacity: 0.6,
                        });

                        if (vwapEnabled) {
                            const cumulativePV: number[] = [];
                            const cumulativeV: number[] = [];
                            const vwap: Array<number | null> = [];

                            let pv = 0;
                            let vv = 0;
                            for (let i = 0; i < close.length; i += 1) {
                                const c = Number(close[i]);
                                const v = Number(volumeY[i]);
                                if (!Number.isFinite(c) || !Number.isFinite(v) || v <= 0) {
                                    cumulativePV.push(pv);
                                    cumulativeV.push(vv);
                                    vwap.push(vv > 0 ? pv / vv : null);
                                    continue;
                                }
                                pv += c * v;
                                vv += v;
                                cumulativePV.push(pv);
                                cumulativeV.push(vv);
                                vwap.push(vv > 0 ? pv / vv : null);
                            }

                            output.push({
                                type: 'scatter',
                                mode: 'lines',
                                name: 'VWAP',
                                x,
                                y: vwap,
                                line: { color: '#FCD34D', width: 2 },
                                yaxis: 'y',
                            });
                        }
                    }
                }

                if (rsiPanelEnabled && close.length > 15) {
                    const rsi = computeRSI(close, 14);
                    output.push({
                        type: 'scatter',
                        mode: 'lines',
                        name: 'RSI 14',
                        x,
                        y: rsi,
                        line: { color: '#A78BFA', width: 1.8 },
                        yaxis: 'y3',
                    });
                }

                return output;
            };

            const indicatorTraces = buildTradingTraces(withMovingAverage);

            // Deep merge layout for Mastiff dark theme
            const layout: any = {
                ...(parsedData.layout || {}),
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(15, 23, 42, 0.28)',
                font: {
                    color: '#d4d4d8',
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
                    gridcolor: 'rgba(148, 163, 184, 0.15)',
                    zerolinecolor: 'rgba(148, 163, 184, 0.2)',
                    linecolor: 'rgba(148, 163, 184, 0.25)',
                    tickfont: { color: '#a1a1aa', size: 10 },
                    rangeslider: parsedData.layout?.xaxis?.rangeslider ?? { visible: hasXAxisSeries && (marketMode ? showRangeSlider : false) },
                    showspikes: true,
                    spikemode: 'across',
                    spikecolor: 'rgba(229, 9, 20, 0.6)',
                    spikethickness: 1,
                },
                yaxis: {
                    ...(parsedData.layout?.yaxis || {}),
                    gridcolor: 'rgba(148, 163, 184, 0.15)',
                    zerolinecolor: 'rgba(148, 163, 184, 0.2)',
                    linecolor: 'rgba(148, 163, 184, 0.25)',
                    tickfont: { color: '#a1a1aa', size: 10 },
                    type: useLogScale ? 'log' : parsedData.layout?.yaxis?.type,
                    showspikes: true,
                    spikemode: 'across',
                    spikecolor: 'rgba(46, 196, 182, 0.45)',
                    spikethickness: 1,
                    title: normalizeSeries ? { text: 'Change (%)' } : parsedData.layout?.yaxis?.title,
                },
                legend: {
                    ...(parsedData.layout?.legend || {}),
                    font: { color: '#d4d4d8', size: 10 },
                    bgcolor: 'rgba(0,0,0,0)'
                },
                colorway: MASTIFF_COLORWAY,
                hovermode: 'x unified',
                hoverlabel: {
                    bgcolor: '#111827',
                    bordercolor: 'rgba(148, 163, 184, 0.4)',
                    font: { color: '#f4f4f5', size: 11, family: 'IBM Plex Sans' }
                },
            };

            if (hasXAxisSeries) {
                layout.xaxis.rangeselector = parsedData.layout?.xaxis?.rangeselector ?? {
                    bgcolor: 'rgba(15, 23, 42, 0.7)',
                    activecolor: '#E50914',
                    bordercolor: 'rgba(148, 163, 184, 0.25)',
                };
            }

            if (volumePanelEnabled) {
                layout.yaxis2 = {
                    domain: rsiPanelEnabled ? [0.2, 0.33] : [0, 0.22],
                    showgrid: false,
                    tickfont: { color: '#94A3B8', size: 9 },
                    title: { text: 'Volume', font: { size: 10, color: '#94A3B8' } },
                    fixedrange: false,
                    anchor: 'x',
                };
            }

            if (rsiPanelEnabled) {
                layout.yaxis3 = {
                    domain: [0, 0.14],
                    range: [0, 100],
                    tickfont: { color: '#A78BFA', size: 9 },
                    title: { text: 'RSI', font: { size: 10, color: '#A78BFA' } },
                    gridcolor: 'rgba(167, 139, 250, 0.15)',
                    zerolinecolor: 'rgba(167, 139, 250, 0.2)',
                    anchor: 'x',
                };
                layout.shapes = [
                    {
                        type: 'line',
                        xref: 'paper',
                        yref: 'y3',
                        x0: 0,
                        x1: 1,
                        y0: 70,
                        y1: 70,
                        line: { color: 'rgba(239, 68, 68, 0.45)', width: 1, dash: 'dash' },
                    },
                    {
                        type: 'line',
                        xref: 'paper',
                        yref: 'y3',
                        x0: 0,
                        x1: 1,
                        y0: 30,
                        y1: 30,
                        line: { color: 'rgba(52, 211, 153, 0.45)', width: 1, dash: 'dash' },
                    },
                ];
            } else if (Array.isArray(parsedData.layout?.shapes)) {
                layout.shapes = parsedData.layout.shapes;
            }

            if (volumePanelEnabled || rsiPanelEnabled) {
                layout.yaxis = {
                    ...layout.yaxis,
                    domain: rsiPanelEnabled ? [0.38, 1] : [0.3, 1],
                };
            }

            // Respect intrinsic colorscales and categorical color maps (e.g., heatmaps, pies).
            const traces = indicatorTraces.map((trace: any, i: number) => {
                const traceType = String(trace?.type || '').toLowerCase();
                const keepIntrinsicColor = [
                    'heatmap',
                    'contour',
                    'surface',
                    'candlestick',
                    'ohlc',
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
                        color: trace.marker?.color || MASTIFF_COLORWAY[i % MASTIFF_COLORWAY.length],
                    },
                    line: {
                        ...(trace.line || {}),
                        color: trace.line?.color || MASTIFF_COLORWAY[i % MASTIFF_COLORWAY.length],
                    }
                };
            });

            try {
                (window as any).Plotly.newPlot(chartRef.current, traces, layout, {
                    responsive: true,
                    displayModeBar: true,
                    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                    modeBarButtonsToAdd: ['hoverclosest', 'hovercompare', 'drawline', 'drawopenpath', 'eraseshape'],
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
    }, [
        data,
        bollingerEnabled,
        hasOHLCSeries,
        hasXAxisSeries,
        hasVolumeSeries,
        isDateLikeSeries,
        maWindow,
        marketMode,
        normalizeSeries,
        parsedPayload,
        pointWindow,
        priceView,
        rangePreset,
        rsiPanelEnabled,
        showRangeSlider,
        useLogScale,
        volumePanelEnabled,
        vwapEnabled,
    ]);

    // Re-render when expanded
    useEffect(() => {
        if (isLoaded && chartRef.current && (window as any).Plotly) {
            (window as any).Plotly.Plots.resize(chartRef.current);
        }
    }, [isExpanded, isLoaded]);

    useEffect(() => {
        if (!isExpanded) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isExpanded]);

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

    const calculateChartHeight = (chartData: any): string => {
        try {
            const p = typeof chartData === 'string' ? JSON.parse(chartData) : chartData;
            return p?.layout?.height ? `${Math.max(Number(p.layout.height), 400)}px` : '560px';
        } catch {
            return '560px';
        }
    };

    const chipBase = 'h-6 px-2.5 rounded-md border text-[9px] font-semibold font-mono uppercase tracking-[0.12em] transition-all';
    const chipClass = (active: boolean) => `${chipBase} ${active
        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
        : 'bg-zinc-900/70 text-zinc-400 border-zinc-700/70 hover:text-zinc-100 hover:bg-zinc-800/90'
        }`;

    return (
        <div className={`w-full ${isExpanded ? 'fixed inset-0 z-[120] p-3 sm:p-6' : 'relative z-0'}`}>
            {isExpanded && (
                <div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={() => setIsExpanded(false)}
                    aria-hidden="true"
                />
            )}
            <div className={`w-full rounded-2xl overflow-hidden border border-zinc-700/40 bg-zinc-950/75 shadow-[0_24px_80px_rgba(0,0,0,0.42)] animate-fade-in transition-all ${isExpanded ? 'relative h-full' : ''}`}>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-950/70">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
                    <span className="text-[8px] font-semibold font-mono text-zinc-400 uppercase tracking-[0.24em]">Interactive Analysis</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {hasXAxisSeries && (
                        <select
                            value={pointWindow}
                            onChange={(e) => setPointWindow(e.target.value as 'all' | '24' | '60' | '120')}
                            className="h-7 rounded-md border border-zinc-700/80 bg-zinc-950/90 px-2 text-[10px] font-semibold font-mono text-zinc-300 focus:border-zinc-300/80 focus:outline-none"
                            title="Select visible sample window"
                        >
                            <option value="all">All</option>
                            <option value="120">120 points</option>
                            <option value="60">60 points</option>
                            <option value="24">24 points</option>
                        </select>
                    )}
                    <button onClick={handleResetZoom} title="Reset zoom" className="p-1.5 rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                        <RotateCcw size={12} />
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                        {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    <button onClick={handleExport} className="p-1.5 rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900 transition-all">
                        <Download size={12} />
                    </button>
                </div>
            </div>

            <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex flex-wrap items-center gap-1.5">
                {(['ALL', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as const).map((preset) => (
                    <button
                        key={preset}
                        onClick={() => setRangePreset(preset)}
                        className={chipClass(rangePreset === preset)}
                        title={`Set range ${preset}`}
                    >
                        {preset}
                    </button>
                ))}

                <span className="mx-1 h-4 w-px bg-zinc-700/60" />

                <button
                    onClick={() => setMaWindow(maWindow === '20' ? 'off' : '20')}
                    className={chipClass(maWindow === '20')}
                    title="Toggle moving average 20"
                >
                    MA20
                </button>

                <button
                    onClick={() => setMaWindow(maWindow === '50' ? 'off' : '50')}
                    className={chipClass(maWindow === '50')}
                    title="Toggle moving average 50"
                >
                    MA50
                </button>

                <button
                    onClick={() => setNormalizeSeries((prev) => !prev)}
                    className={chipClass(normalizeSeries)}
                    title="Normalize values to percent change"
                >
                    %
                </button>

                <button
                    onClick={() => setUseLogScale((prev) => !prev)}
                    className={chipClass(useLogScale)}
                    title="Toggle logarithmic scale"
                >
                    LOG
                </button>

                {marketMode && (
                    <button
                        onClick={() => setShowRangeSlider((prev) => !prev)}
                        className={chipClass(showRangeSlider)}
                        title="Toggle lower range slider"
                    >
                        SLIDER
                    </button>
                )}

                {marketMode && (
                    <>
                        <span className="mx-1 h-4 w-px bg-zinc-700/60" />
                        <button
                            onClick={() => setPriceView((prev) => prev === 'candles' ? 'line' : 'candles')}
                            className={chipClass(priceView === 'candles')}
                            title="Switch between candles and close line"
                        >
                            {priceView === 'candles' ? 'CANDLE' : 'LINE'}
                        </button>

                        <button
                            onClick={() => setShowBollinger((prev) => !prev)}
                            className={chipClass(bollingerEnabled)}
                            title="Toggle Bollinger Bands"
                        >
                            BB
                        </button>

                        <button
                            onClick={() => setShowRSI((prev) => !prev)}
                            className={chipClass(rsiPanelEnabled)}
                            title="Toggle RSI panel"
                        >
                            RSI
                        </button>

                        {(hasVolumeSeries || hasOHLCSeries) && (
                            <button
                                onClick={() => setShowVolume((prev) => !prev)}
                                className={chipClass(volumePanelEnabled)}
                                title="Toggle volume bars"
                            >
                                VOL
                            </button>
                        )}

                        <button
                            onClick={() => setShowVWAP((prev) => !prev)}
                            className={`${chipClass(vwapEnabled)} ${!volumePanelEnabled ? 'opacity-45 cursor-not-allowed' : ''}`}
                            title="Toggle VWAP"
                            disabled={!volumePanelEnabled}
                        >
                            VWAP
                        </button>
                    </>
                )}
            </div>

            {/* Chart Area — height driven by chart's own layout.height, else 560px default */}
            <div className={`w-full ${isExpanded ? 'h-[calc(100vh-155px)]' : ''}`}
                style={!isExpanded ? { height: calculateChartHeight(data) } : {}}>
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
        </div>
    );
};
