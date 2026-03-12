import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

function getLoopArcPath({ sourceX, sourceY, targetX, targetY, loopDirection, loopEdgeRole }) {
    if (loopDirection === 'TB') {
        if (loopEdgeRole === 'chain') {
            const offset = Math.max(110, Math.abs(targetY - sourceY) * 0.55);
            const controlY = Math.max(sourceY, targetY) + offset;

            return {
                edgePath: `M ${sourceX} ${sourceY} C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`,
                labelX: sourceX + ((targetX - sourceX) / 2),
                labelY: controlY,
            };
        }

        const offset = Math.max(120, Math.abs(targetX - sourceX) * 0.4);
        const controlX = loopEdgeRole === 'entry'
            ? Math.min(sourceX, targetX) - offset
            : Math.max(sourceX, targetX) + offset;

        return {
            edgePath: `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`,
            labelX: controlX,
            labelY: sourceY + ((targetY - sourceY) / 2),
        };
    }

    if (loopEdgeRole === 'chain') {
        const offset = Math.max(110, Math.abs(targetX - sourceX) * 0.55);
        const controlX = Math.max(sourceX, targetX) + offset;

        return {
            edgePath: `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`,
            labelX: controlX,
            labelY: sourceY + ((targetY - sourceY) / 2),
        };
    }

    const offset = Math.max(120, Math.abs(targetY - sourceY) * 0.4);
    const controlY = loopEdgeRole === 'entry'
        ? Math.min(sourceY, targetY) - offset
        : Math.max(sourceY, targetY) + offset;

    return {
        edgePath: `M ${sourceX} ${sourceY} C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`,
        labelX: sourceX + ((targetX - sourceX) / 2),
        labelY: controlY,
    };
}

export default function DeleteEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
}) {
    const isLoopEdge = data?.edgeKind === 'loop' || data?.loopArc;
    const { edgePath, labelX, labelY } = isLoopEdge
        ? getLoopArcPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            loopDirection: data.loopDirection,
            loopEdgeRole: data.loopEdgeRole || (data.loopArc === 'forward' ? 'entry' : 'close'),
        })
        : (() => {
            const [defaultEdgePath, defaultLabelX, defaultLabelY] = getBezierPath({
                sourceX, sourceY, sourcePosition,
                targetX, targetY, targetPosition,
            });

            return {
                edgePath: defaultEdgePath,
                labelX: defaultLabelX,
                labelY: defaultLabelY,
            };
        })();

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
            {!isLoopEdge && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: 'all',
                            zIndex: 10,
                        }}
                        className="nodrag nopan"
                    >
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                if (data && data.onDelete) data.onDelete(id);
                            }}
                            style={{
                                width: '20px',
                                height: '20px',
                                background: 'rgba(255, 100, 100, 0.9)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                                padding: 0,
                                transition: 'all 0.2s'
                            }}
                            title="Delete connection"
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            <X size={12} />
                        </button>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
