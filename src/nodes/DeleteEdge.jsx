import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

function getLoopArcPath({ sourceX, sourceY, targetX, targetY, loopArc, loopDirection }) {
    if (loopDirection === 'TB') {
        const offset = Math.max(100, Math.abs(targetY - sourceY) * 0.45);
        const controlX = loopArc === 'forward'
            ? Math.max(sourceX, targetX) + offset
            : Math.min(sourceX, targetX) - offset;

        return {
            edgePath: `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`,
            labelX: controlX,
            labelY: sourceY + ((targetY - sourceY) / 2),
        };
    }

    const offset = Math.max(90, Math.abs(targetX - sourceX) * 0.35);
    const controlY = loopArc === 'forward'
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
    const { edgePath, labelX, labelY } = data?.loopArc
        ? getLoopArcPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            loopArc: data.loopArc,
            loopDirection: data.loopDirection,
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
        </>
    );
}
