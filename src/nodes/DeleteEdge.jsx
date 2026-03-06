import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

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
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
    });

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
