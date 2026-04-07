"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { VisualizationData } from '../types';

interface PlotlyRendererProps {
    data: any;
}

type RangePreset = 'ALL' | '1M' | '3M' | '6M' | 'YTD' | '1Y';
type PointWindow = 'all' | '12' | '24' | '60';
type TimeAggregation = 'raw' | 'week' | 'month' | 'quarter' | 'year';

function getLayoutTitle(layout: any): string {
    if (!layout) return 'Chart';
    if (typeof layout.title === 'string') return layout.title;
    if (typeof layout.title?.text === 'string') return layout.title.text;
    return 'Chart';
}

function normalizeAxisLabel(value: any, index: number): string {
    if (value === null || value === undefined || value === '') {
        return `Item ${index + 1}`;
    }
    return String(value);
}

function toFiniteNumber(value: any): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function buildHistogramRows(values: any[]): Array<{ bucket: string; value: number }> {
    const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (numericValues.length === 0) return [];

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    if (min === max) {
        return [{ bucket: `${min}`, value: numericValues.length }];
    }

    const bucketCount = Math.min(10, Math.max(4, Math.round(Math.sqrt(numericValues.length))));
    const width = (max - min) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
        bucket: `${(min + (width * index)).toFixed(1)}-${(min + (width * (index + 1))).toFixed(1)}`,
        value: 0,
    }));

    for (const numericValue of numericValues) {
        const rawIndex = Math.floor((numericValue - min) / width);
        const bucketIndex = Math.min(bucketCount - 1, Math.max(0, rawIndex));
        buckets[bucketIndex].value += 1;
    }

    return buckets;
}

function buildPlotlyFallbackVisualization(payload: any): VisualizationData | null {
    const traces = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    const layout = Array.isArray(payload) ? {} : (payload?.layout || {});
    if (traces.length === 0) return null;

    const title = `${getLayoutTitle(layout)} (Fallback View)`;
    const primaryTrace = traces.find((trace: any) => trace) || traces[0];
    const traceType = String(primaryTrace?.type || 'scatter').toLowerCase();

    if (traceType === 'table') {
        const headers = Array.isArray(primaryTrace?.header?.values)
            ? primaryTrace.header.values.map((value: any, index: number) => normalizeAxisLabel(value, index))
            : [];
        const cells = Array.isArray(primaryTrace?.cells?.values) ? primaryTrace.cells.values : [];
        if (headers.length === 0 || cells.length === 0) return null;

        const rowCount = Math.max(...cells.map((column: any[]) => Array.isArray(column) ? column.length : 0), 0);
        const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
            const row: Record<string, any> = {};
            headers.forEach((header: string, columnIndex: number) => {
                row[header] = Array.isArray(cells[columnIndex]) ? cells[columnIndex][rowIndex] ?? '' : '';
            });
            return row;
        });

        return {
            type: 'table',
            title,
            data: rows,
            config: {},
        };
    }

    if (traceType === 'pie') {
        const labels = Array.isArray(primaryTrace?.labels) ? primaryTrace.labels : [];
        const values = Array.isArray(primaryTrace?.values) ? primaryTrace.values : [];
        if (labels.length === 0 || values.length === 0) return null;

        return {
            type: 'pie',
            title,
            data: labels.map((label: any, index: number) => ({
                label: normalizeAxisLabel(label, index),
                value: toFiniteNumber(values[index]),
            })),
            config: {},
        };
    }

    if (traceType === 'heatmap' && Array.isArray(primaryTrace?.z)) {
        const xLabels = Array.isArray(primaryTrace?.x) ? primaryTrace.x : [];
        const yLabels = Array.isArray(primaryTrace?.y) ? primaryTrace.y : [];
        const rows = (primaryTrace.z as any[]).map((rowValues: any, rowIndex: number) => {
            const row: Record<string, any> = {
                segment: normalizeAxisLabel(yLabels[rowIndex], rowIndex),
            };
            (Array.isArray(rowValues) ? rowValues : []).forEach((value: any, columnIndex: number) => {
                row[normalizeAxisLabel(xLabels[columnIndex], columnIndex)] = toFiniteNumber(value);
            });
            return row;
        });

        return rows.length > 0 ? {
            type: 'heatmap',
            title,
            data: rows,
            config: { xAxis: 'segment' },
        } : null;
    }

    if (traceType === 'histogram') {
        const histogramSource = Array.isArray(primaryTrace?.x) ? primaryTrace.x : primaryTrace?.y;
        const histogramRows = Array.isArray(histogramSource) ? buildHistogramRows(histogramSource) : [];
        return histogramRows.length > 0 ? {
            type: 'bar',
            title,
            data: histogramRows,
            config: { xAxis: 'bucket', keys: ['value'] },
        } : null;
    }

    const xValues = Array.isArray(primaryTrace?.x)
        ? primaryTrace.x
        : Array.from({ length: Array.isArray(primaryTrace?.y) ? primaryTrace.y.length : 0 }, (_, index) => index + 1);
    const yValues = Array.isArray(primaryTrace?.y) ? primaryTrace.y : [];

    if (xValues.length > 0 && yValues.length > 0) {
        const metricKey = String(primaryTrace?.name || 'value');
        const data = xValues.map((value: any, index: number) => ({
            label: normalizeAxisLabel(value, index),
            [metricKey]: toFiniteNumber(yValues[index]),
        }));

        return {
            type: traceType === 'bar' ? 'bar' : 'line',
            title,
            data,
            config: { xAxis: 'label', keys: [metricKey] },
        };
    }

    return null;
}

export const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [rangePreset, setRangePreset] = useState<RangePreset>('ALL');
    const [pointWindow, setPointWindow] = useState<PointWindow>('all');
    const [maWindow, setMaWindow] = useState<'off' | '20' | '50'>('off');
    const [timeAggregation, setTimeAggregation] = useState<TimeAggregation>('raw');
    const [useLogScale, setUseLogScale] = useState(false);
    const [normalizeSeries, setNormalizeSeries] = useState(false);
    const [showRangeSlider, setShowRangeSlider] = useState(true);
    const [showVolume, setShowVolume] = useState(true);
    const [showVWAP, setShowVWAP] = useState(false);
    const [showBollinger, setShowBollinger] = useState(false);
    const [showRSI, setShowRSI] = useState(false);
    const [priceView, setPriceView] = useState<'candles' | 'line'>('candles');

    const MASTIFF_COLORWAY = [
        '#38BDF8', '#F97316', '#2DD4BF', '#FACC15', '#FB7185',
        '#818CF8', '#34D399', '#F59E0B', '#22C55E', '#E879F9'
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

    const traceList = useMemo(() => {
        if (Array.isArray(parsedPayload)) return parsedPayload;
        if (Array.isArray(parsedPayload?.data)) return parsedPayload.data;
        return [];
    }, [parsedPayload]);

    const layoutPayload = useMemo(() => {
        return Array.isArray(parsedPayload) ? {} : (parsedPayload?.layout || {});
    }, [parsedPayload]);

    const fallbackVisualization = useMemo(() => {
        return buildPlotlyFallbackVisualization(parsedPayload);
    }, [parsedPayload]);

    const hasTableTrace = useMemo(() => {
        return traceList.some((trace: any) => String(trace?.type || '').toLowerCase() === 'table');
    }, [traceList]);

    const isMultiPanelChart = useMemo(() => {
        if (!layoutPayload || typeof layoutPayload !== 'object') return false;

        const hasGrid = Boolean((layoutPayload as any).grid?.rows || (layoutPayload as any).grid?.columns);
        const hasSecondaryAxes = Object.keys(layoutPayload).some((key) => /^xaxis\d+$|^yaxis\d+$/.test(key));
        const traceSubplots = traceList.some((trace: any) => {
            const xaxis = String(trace?.xaxis || 'x');
            const yaxis = String(trace?.yaxis || 'y');
            return xaxis !== 'x' || yaxis !== 'y';
        });

        return hasGrid || hasSecondaryAxes || traceSubplots;
    }, [layoutPayload, traceList]);

    const hasXAxisSeries = useMemo(() => {
        return traceList.some((trace: any) => Array.isArray(trace?.x) && trace.x.length > 2);
    }, [traceList]);

    const isDateLikeSeries = useMemo(() => {
        const sampleTrace = traceList.find((trace: any) => Array.isArray(trace?.x) && trace.x.length >= 3);
        if (!sampleTrace?.x) return false;

        const sample = sampleTrace.x.slice(0, 10);
        const parsedCount = sample.filter((value: any) => {
            if (value instanceof Date) return true;
            if (typeof value === 'number') return value > 946684800000; // year 2000+ as ms timestamp
            if (typeof value !== 'string') return false;
            return !Number.isNaN(Date.parse(value));
        }).length;

        return parsedCount >= Math.ceil(sample.length * 0.6);
    }, [traceList]);

    const hasOHLCSeries = useMemo(() => {
        return traceList.some((trace: any) => {
            const type = String(trace?.type || '').toLowerCase();
            return type === 'candlestick' || type === 'ohlc' || (
                Array.isArray(trace?.open)
                && Array.isArray(trace?.high)
                && Array.isArray(trace?.low)
                && Array.isArray(trace?.close)
            );
        });
    }, [traceList]);

    const hasVolumeSeries = useMemo(() => {
        return traceList.some((trace: any) => {
            const maybeName = String(trace?.name || '').toLowerCase();
            return maybeName.includes('volume') || maybeName.includes('vol') || Array.isArray(trace?.volume);
        });
    }, [traceList]);

    const hasSimpleNumericTimeSeries = useMemo(() => {
        if (!isDateLikeSeries || isMultiPanelChart || hasTableTrace) return false;

        return traceList.some((trace: any) => {
            if (!Array.isArray(trace?.x) || !Array.isArray(trace?.y) || trace.x.length !== trace.y.length) {
                return false;
            }

            const type = String(trace?.type || 'scatter').toLowerCase();
            if (['table', 'pie', 'heatmap', 'surface', 'candlestick', 'ohlc'].includes(type)) {
                return false;
            }

            return trace.y.some((value: any) => Number.isFinite(Number(value)));
        });
    }, [hasTableTrace, isDateLikeSeries, isMultiPanelChart, traceList]);

    const marketMode = hasOHLCSeries;
    const marketControlsEnabled = marketMode && !isMultiPanelChart;
    const supportsTimeAggregation = hasSimpleNumericTimeSeries && !marketMode;
    const supportsRangePresets = marketControlsEnabled && isDateLikeSeries;
    const supportsPointWindow = !isMultiPanelChart && hasXAxisSeries && !hasTableTrace;
    const supportsMovingAverage = !isMultiPanelChart && !hasTableTrace && hasXAxisSeries;
    const supportsSeriesScale = !isMultiPanelChart && !hasTableTrace && hasXAxisSeries;
    const volumePanelEnabled = marketControlsEnabled && showVolume;
    const rsiPanelEnabled = marketControlsEnabled && showRSI;
    const vwapEnabled = marketControlsEnabled && showVWAP;
    const bollingerEnabled = marketControlsEnabled && showBollinger;

    useEffect(() => {
        if (!supportsTimeAggregation && timeAggregation !== 'raw') {
            setTimeAggregation('raw');
        }
    }, [supportsTimeAggregation, timeAggregation]);

    useEffect(() => {
        if (!supportsRangePresets && rangePreset !== 'ALL') {
            setRangePreset('ALL');
        }
    }, [rangePreset, supportsRangePresets]);

    useEffect(() => {
        if (!chartRef.current || !data) return;
        setRenderError(null);
        let loadTimeout: number | undefined;

        // Load Plotly from CDN if not present
        if (!(window as any).Plotly) {
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-2.35.0.min.js';
            script.async = true;
            loadTimeout = window.setTimeout(() => {
                if (!(window as any).Plotly) {
                    setRenderError('Plotly runtime timed out, so Mastiff is switching to a local chart fallback.');
                }
            }, 3500);
            script.onload = () => {
                if (loadTimeout) window.clearTimeout(loadTimeout);
                setIsLoaded(true);
                renderChart();
            };
            script.onerror = () => {
                if (loadTimeout) window.clearTimeout(loadTimeout);
                setRenderError('Failed to load Plotly runtime. Check network or ad-block settings.');
            };
            document.head.appendChild(script);
        } else {
            if (loadTimeout) window.clearTimeout(loadTimeout);
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

            const buildTimeBucket = (value: any, aggregation: TimeAggregation) => {
                const ms = toDateMs(value);
                if (ms === null) return null;

                const sourceDate = new Date(ms);
                const bucketDate = new Date(sourceDate);

                if (aggregation === 'year') {
                    bucketDate.setMonth(0, 1);
                    bucketDate.setHours(0, 0, 0, 0);
                    return {
                        bucketKey: `${bucketDate.getFullYear()}`,
                        label: `${bucketDate.getFullYear()}`,
                        sortValue: bucketDate.getTime(),
                    };
                }

                if (aggregation === 'quarter') {
                    const quarterMonth = Math.floor(bucketDate.getMonth() / 3) * 3;
                    bucketDate.setMonth(quarterMonth, 1);
                    bucketDate.setHours(0, 0, 0, 0);
                    const quarter = Math.floor(quarterMonth / 3) + 1;
                    return {
                        bucketKey: `${bucketDate.getFullYear()}-Q${quarter}`,
                        label: `Q${quarter} ${bucketDate.getFullYear()}`,
                        sortValue: bucketDate.getTime(),
                    };
                }

                if (aggregation === 'month') {
                    bucketDate.setDate(1);
                    bucketDate.setHours(0, 0, 0, 0);
                    return {
                        bucketKey: `${bucketDate.getFullYear()}-${bucketDate.getMonth()}`,
                        label: bucketDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
                        sortValue: bucketDate.getTime(),
                    };
                }

                if (aggregation === 'week') {
                    const weekday = bucketDate.getDay();
                    const diff = weekday === 0 ? -6 : 1 - weekday;
                    bucketDate.setDate(bucketDate.getDate() + diff);
                    bucketDate.setHours(0, 0, 0, 0);
                    return {
                        bucketKey: `W-${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${bucketDate.getDate()}`,
                        label: bucketDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
                        sortValue: bucketDate.getTime(),
                    };
                }

                return null;
            };

            const aggregateTraceByPeriod = (trace: any) => {
                if (!supportsTimeAggregation || timeAggregation === 'raw') {
                    return trace;
                }

                if (!Array.isArray(trace?.x) || !Array.isArray(trace?.y) || trace.x.length !== trace.y.length) {
                    return trace;
                }

                const type = String(trace?.type || 'scatter').toLowerCase();
                if (['table', 'pie', 'heatmap', 'surface', 'candlestick', 'ohlc'].includes(type)) {
                    return trace;
                }

                const buckets = new Map<string, { label: string; sortValue: number; values: number[] }>();

                trace.x.forEach((xValue: any, index: number) => {
                    const bucket = buildTimeBucket(xValue, timeAggregation);
                    const numericValue = Number(trace.y[index]);
                    if (!bucket || !Number.isFinite(numericValue)) {
                        return;
                    }

                    const existing = buckets.get(bucket.bucketKey);
                    if (existing) {
                        existing.values.push(numericValue);
                        return;
                    }

                    buckets.set(bucket.bucketKey, {
                        label: bucket.label,
                        sortValue: bucket.sortValue,
                        values: [numericValue],
                    });
                });

                const entries = Array.from(buckets.values()).sort((left, right) => left.sortValue - right.sortValue);
                if (entries.length < 2) {
                    return trace;
                }

                const reducer = type === 'bar'
                    ? (values: number[]) => values.reduce((sum, value) => sum + value, 0)
                    : (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

                return {
                    ...trace,
                    x: entries.map((entry) => entry.label),
                    y: entries.map((entry) => reducer(entry.values)),
                    text: undefined,
                    hovertext: undefined,
                    customdata: undefined,
                    ids: undefined,
                };
            };

            const resolveStartIndex = (xValues: any[]): number => {
                if (!Array.isArray(xValues) || xValues.length < 2) return 0;

                if (supportsRangePresets && rangePreset !== 'ALL') {
                    const timeline = xValues
                        .map((value, index) => ({ index, ms: toDateMs(value) }))
                        .filter((entry) => entry.ms !== null) as Array<{ index: number; ms: number }>;

                    if (timeline.length > 2) {
                        const latestMs = timeline[timeline.length - 1].ms;
                        const now = new Date(latestMs);

                        let cutoff = 0;
                        switch (rangePreset) {
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

                if (supportsPointWindow && pointWindow !== 'all') {
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

            const aggregatedTraces = rawTraces.map((trace: any) => aggregateTraceByPeriod(trace));
            const durationFilteredTraces = aggregatedTraces.map((trace: any) => applyDurationFilter(trace));

            const maybeNormalizeTrace = (trace: any) => {
                if (!supportsSeriesScale || !normalizeSeries || !Array.isArray(trace?.y)) {
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
                if (!supportsMovingAverage || maWindow === 'off') return traces;

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
                        const mean = seg.reduce((sum: number, v: number) => sum + v, 0) / seg.length;
                        const variance = seg.reduce((sum: number, v: number) => sum + ((v - mean) ** 2), 0) / seg.length;
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
            const preferBottomLegend = isMultiPanelChart || indicatorTraces.length > 6 || hasTableTrace;
            const defaultTopMargin = preferBottomLegend ? 76 : 92;
            const defaultBottomMargin = preferBottomLegend ? 112 : 56;

            const sanitizeAnnotationText = (value: unknown): string => {
                return String(value || '')
                    .replace(/[^\x20-\x7E]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            const sanitizedAnnotations = Array.isArray(parsedData.layout?.annotations)
                ? parsedData.layout.annotations.map((annotation: any) => ({
                    ...annotation,
                    text: sanitizeAnnotationText(annotation?.text),
                }))
                : parsedData.layout?.annotations;

            // Deep merge layout for Mastiff dark theme
            const layout: any = {
                ...(parsedData.layout || {}),
                paper_bgcolor: 'rgba(5, 10, 20, 0)',
                plot_bgcolor: 'rgba(15, 23, 42, 0.56)',
                font: {
                    color: '#E5E7EB',
                    family: 'IBM Plex Sans, system-ui, sans-serif',
                    size: 11
                },
                margin: {
                    t: parsedData.layout?.margin?.t ?? ((parsedData.layout?.title || preferBottomLegend) ? defaultTopMargin : 24),
                    r: parsedData.layout?.margin?.r ?? 24,
                    l: parsedData.layout?.margin?.l ?? 56,
                    b: parsedData.layout?.margin?.b ?? defaultBottomMargin,
                },
                autosize: true,
                dragmode: 'pan',
                xaxis: {
                    ...(parsedData.layout?.xaxis || {}),
                    gridcolor: 'rgba(148, 163, 184, 0.15)',
                    zerolinecolor: 'rgba(148, 163, 184, 0.2)',
                    linecolor: 'rgba(148, 163, 184, 0.25)',
                    tickfont: { color: '#a1a1aa', size: 10 },
                    automargin: true,
                    rangeslider: parsedData.layout?.xaxis?.rangeslider ?? { visible: supportsRangePresets && showRangeSlider },
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
                    automargin: true,
                    type: supportsSeriesScale && useLogScale ? 'log' : parsedData.layout?.yaxis?.type,
                    showspikes: true,
                    spikemode: 'across',
                    spikecolor: 'rgba(46, 196, 182, 0.45)',
                    spikethickness: 1,
                    title: normalizeSeries ? { text: 'Change (%)' } : parsedData.layout?.yaxis?.title,
                },
                title: parsedData.layout?.title
                    ? {
                        ...(typeof parsedData.layout.title === 'string' ? { text: parsedData.layout.title } : parsedData.layout.title),
                        x: 0.02,
                        xanchor: 'left',
                        y: 0.98,
                        yanchor: 'top',
                        font: {
                            size: 15,
                            color: '#F8FAFC',
                            family: 'IBM Plex Sans, system-ui, sans-serif',
                            ...(typeof parsedData.layout.title === 'object' ? parsedData.layout.title.font : {}),
                        },
                    }
                    : undefined,
                legend: {
                    ...(parsedData.layout?.legend || {}),
                    orientation: 'h',
                    yanchor: preferBottomLegend ? 'top' : 'bottom',
                    y: preferBottomLegend ? -0.12 : 1.02,
                    xanchor: 'left',
                    x: 0,
                    font: { color: '#CBD5E1', size: 10 },
                    bgcolor: 'rgba(0,0,0,0)',
                    tracegroupgap: 8,
                },
                colorway: MASTIFF_COLORWAY,
                hovermode: isMultiPanelChart ? 'closest' : (hasXAxisSeries ? 'x unified' : 'closest'),
                annotations: sanitizedAnnotations,
                newshape: {
                    line: {
                        color: '#F8FAFC',
                        width: 2,
                    },
                },
                hoverlabel: {
                    bgcolor: '#111827',
                    bordercolor: 'rgba(148, 163, 184, 0.4)',
                    font: { color: '#f4f4f5', size: 11, family: 'IBM Plex Sans' }
                },
            };

            if (supportsRangePresets) {
                layout.xaxis.rangeselector = parsedData.layout?.xaxis?.rangeselector ?? {
                    bgcolor: 'rgba(15, 23, 42, 0.7)',
                    activecolor: '#38BDF8',
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

                if (traceType === 'table') {
                    return {
                        ...trace,
                        header: {
                            ...(trace.header || {}),
                            fill: { color: '#D1FAE5' },
                            font: { color: '#0F172A', size: 11, ...(trace.header?.font || {}) },
                            line: { color: 'rgba(148, 163, 184, 0.35)' },
                            align: 'left',
                            height: 28,
                        },
                        cells: {
                            ...(trace.cells || {}),
                            fill: { color: '#F8FAFC' },
                            font: { color: '#0F172A', size: 10, ...(trace.cells?.font || {}) },
                            line: { color: 'rgba(148, 163, 184, 0.2)' },
                            align: 'left',
                            height: 24,
                        },
                    };
                }

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
                    editable: true,
                    edits: {
                        shapePosition: true,
                        annotationPosition: false,
                        annotationText: false,
                        titleText: false,
                        legendPosition: false,
                    },
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
            if (loadTimeout) {
                window.clearTimeout(loadTimeout);
            }
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
        isMultiPanelChart,
        hasTableTrace,
        maWindow,
        marketMode,
        normalizeSeries,
        parsedPayload,
        pointWindow,
        priceView,
        rangePreset,
        rsiPanelEnabled,
        showRangeSlider,
        supportsMovingAverage,
        supportsPointWindow,
        supportsRangePresets,
        supportsSeriesScale,
        supportsTimeAggregation,
        useLogScale,
        volumePanelEnabled,
        vwapEnabled,
        timeAggregation,
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
            const layout = p?.layout || {};
            const gridRows = Number(layout?.grid?.rows || 0);
            const gridHeight = gridRows > 0 ? (gridRows * 260) + 140 : 0;
            const hasExtraAxes = Object.keys(layout).some((key) => /^xaxis\d+$|^yaxis\d+$/.test(key));
            const traceCount = Array.isArray(p?.data) ? p.data.length : 0;
            const minimumHeight = gridHeight || (hasExtraAxes || traceCount > 6 ? 880 : 560);
            return `${Math.max(Number(layout?.height || 0), minimumHeight, 400)}px`;
        } catch {
            return '560px';
        }
    };

    const chipBase = 'h-6 px-2.5 rounded-md border text-[9px] font-semibold font-mono uppercase tracking-[0.12em] transition-all';
    const chipClass = (active: boolean) => `${chipBase} ${active
        ? 'border-transparent bg-[linear-gradient(135deg,rgba(56,189,248,0.96),rgba(251,113,133,0.88))] text-white shadow-[0_10px_30px_rgba(56,189,248,0.18)]'
        : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-sky-300/25 hover:bg-white/[0.08] hover:text-white'
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
            <div className={`w-full overflow-hidden rounded-[28px] border border-sky-300/15 bg-[linear-gradient(180deg,rgba(15,24,40,0.96),rgba(7,14,25,0.84))] shadow-[0_24px_80px_rgba(2,6,23,0.32)] animate-fade-in transition-all ${isExpanded ? 'relative h-full' : ''}`}>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(180deg,rgba(10,18,32,0.84),rgba(9,15,27,0.72))] px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[linear-gradient(135deg,#38BDF8,#FB7185,#2DD4BF)] shadow-[0_0_14px_rgba(56,189,248,0.45)]" />
                    <span className="bg-[linear-gradient(135deg,#c7f2ff,#fecdd3,#b2f5ea)] bg-clip-text text-[8px] font-semibold font-mono uppercase tracking-[0.24em] text-transparent">Interactive Analysis</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {supportsPointWindow && (
                        <select
                            value={pointWindow}
                            onChange={(e) => setPointWindow(e.target.value as PointWindow)}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.05] px-2 text-[10px] font-semibold font-mono text-slate-200 focus:border-sky-300/50 focus:outline-none"
                            title="Select visible sample window"
                        >
                            <option value="all">All points</option>
                            <option value="60">60 points</option>
                            <option value="24">24 points</option>
                            <option value="12">12 points</option>
                        </select>
                    )}
                    <button onClick={handleResetZoom} title="Reset zoom" className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:bg-white/[0.08] hover:text-white">
                        <RotateCcw size={12} />
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:bg-white/[0.08] hover:text-white">
                        {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    <button onClick={handleExport} className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:bg-white/[0.08] hover:text-white">
                        <Download size={12} />
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-white/[0.02] px-4 py-2">
                {supportsTimeAggregation && (
                    <>
                        {([
                            ['raw', 'Raw'],
                            ['week', 'Weekly'],
                            ['month', 'Monthly'],
                            ['quarter', 'Quarterly'],
                            ['year', 'Yearly'],
                        ] as const).map(([aggregation, label]) => (
                            <button
                                key={aggregation}
                                onClick={() => setTimeAggregation(aggregation)}
                                className={chipClass(timeAggregation === aggregation)}
                                title={`Aggregate series by ${label.toLowerCase()}`}
                            >
                                {label}
                            </button>
                        ))}
                        <span className="mx-1 h-4 w-px bg-zinc-700/60" />
                    </>
                )}

                {supportsRangePresets && (['ALL', '1M', '3M', '6M', 'YTD', '1Y'] as const).map((preset) => (
                    <button
                        key={preset}
                        onClick={() => setRangePreset(preset)}
                        className={chipClass(rangePreset === preset)}
                        title={`Set range ${preset}`}
                    >
                        {preset}
                    </button>
                ))}

                {(supportsRangePresets || supportsTimeAggregation) && (
                    <span className="mx-1 h-4 w-px bg-zinc-700/60" />
                )}

                {supportsMovingAverage && (
                    <>
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
                    </>
                )}

                {supportsSeriesScale && (
                    <button
                        onClick={() => setNormalizeSeries((prev) => !prev)}
                        className={chipClass(normalizeSeries)}
                        title="Normalize values to percent change"
                    >
                        %
                    </button>
                )}

                {supportsSeriesScale && (
                    <button
                        onClick={() => setUseLogScale((prev) => !prev)}
                        className={chipClass(useLogScale)}
                        title="Toggle logarithmic scale"
                    >
                        LOG
                    </button>
                )}

                {supportsRangePresets && (
                    <button
                        onClick={() => setShowRangeSlider((prev) => !prev)}
                        className={chipClass(showRangeSlider)}
                        title="Toggle lower range slider"
                    >
                        SLIDER
                    </button>
                )}

                {marketControlsEnabled && (
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

                {!marketControlsEnabled && isMultiPanelChart && (
                    <span className="text-[9px] font-medium text-zinc-400">
                        Dashboard view: advanced indicators are disabled on multi-panel charts to keep axes and labels aligned.
                    </span>
                )}
            </div>

            {/* Chart Area — height driven by chart's own layout.height, else 560px default */}
            <div className={`w-full ${isExpanded ? 'h-[calc(100vh-155px)]' : ''}`}
                style={!isExpanded ? { height: calculateChartHeight(data) } : {}}>
                {!isLoaded && (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Loading chart...</span>
                        </div>
                    </div>
                )}
                {renderError && fallbackVisualization && (
                    <div className="w-full h-full overflow-auto p-3 custom-scrollbar">
                        <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[10px] font-semibold text-amber-100">
                            Plotly interactive runtime was unavailable, so Mastiff switched to a local fallback chart.
                        </div>
                        <ChartRenderer viz={fallbackVisualization} />
                    </div>
                )}
                {renderError && !fallbackVisualization && (
                    <div className="w-full h-full flex items-center justify-center p-4">
                        <div className="text-[10px] text-red-400 font-semibold text-center">{renderError}</div>
                    </div>
                )}
                {!renderError && <div ref={chartRef} className="w-full h-full" />}
            </div>
            </div>
        </div>
    );
};
