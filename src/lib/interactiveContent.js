function createInteractiveId(prefix, ...parts) {
    const source = parts
        .flat()
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('|');
    let hash = 0;

    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
    }

    return `${prefix}-${hash.toString(36)}`;
}

function parseStrictCheckboxLine(line) {
    const strictMatch = line.match(/^(?:-\s*\[\s*\]|\*\s*\[\s*\]|[□☐])\s*(.+)$/);
    return strictMatch ? strictMatch[1].trim() : null;
}

function parseLooseCheckboxLine(line) {
    const looseMatch = line.match(/^[-*・]\s+(.+)$/);
    return looseMatch ? looseMatch[1].trim() : null;
}

function parseSelectLine(line) {
    const match = line.match(/^([1-9A-D](?:[.)\]])?)\s+(.+)$/);
    if (!match) return null;

    return {
        value: match[1],
        label: match[2].trim(),
    };
}

function isLikelyInteractiveTitle(line) {
    if (!line) return false;

    return [
        /選ん/,
        /該当/,
        /当てはま/,
        /複数選択/,
        /単一選択/,
        /ひとつ選/,
        /1つ選/,
        /チェック/,
        /choose/i,
        /select/i,
    ].some((pattern) => pattern.test(line));
}

export function parseInteractiveContent(text = '') {
    const parts = [];
    const lines = text.split('\n');
    let currentText = '';
    let pendingTitle = '';
    let currentGroup = null;
    let groupIndex = 0;

    const appendText = (line) => {
        currentText = currentText ? `${currentText}\n${line}` : line;
    };

    const flushText = () => {
        const nextText = currentText.trim();
        if (nextText) {
            parts.push({ type: 'text', content: nextText });
        }
        currentText = '';
    };

    const flushGroup = () => {
        if (currentGroup?.items?.length) {
            parts.push(currentGroup);
        }
        currentGroup = null;
    };

    lines.forEach((rawLine) => {
        const trimmed = rawLine.trim();

        if (!trimmed) {
            if (currentGroup) {
                flushGroup();
            } else if (pendingTitle) {
                appendText(pendingTitle);
                pendingTitle = '';
            } else if (currentText && !currentText.endsWith('\n')) {
                currentText += '\n';
            }
            return;
        }

        const strictCheckboxLabel = parseStrictCheckboxLine(trimmed);
        const allowLooseCheckbox = Boolean(currentGroup?.type === 'checkbox' || pendingTitle);
        const checkboxLabel = strictCheckboxLabel || (allowLooseCheckbox ? parseLooseCheckboxLine(trimmed) : null);
        if (checkboxLabel) {
            if (!currentGroup || currentGroup.type !== 'checkbox') {
                flushText();
                flushGroup();
                currentGroup = { type: 'checkbox', title: pendingTitle, items: [] };
                pendingTitle = '';
                groupIndex += 1;
            }
            currentGroup.items.push({
                id: createInteractiveId('cb', groupIndex, currentGroup.title, currentGroup.items.length, checkboxLabel),
                label: checkboxLabel,
                checked: false,
            });
            return;
        }

        const selectOption = parseSelectLine(trimmed);
        if (selectOption) {
            if (!currentGroup || currentGroup.type !== 'select') {
                flushText();
                flushGroup();
                currentGroup = { type: 'select', title: pendingTitle, items: [] };
                pendingTitle = '';
                groupIndex += 1;
            }
            currentGroup.items.push({
                id: createInteractiveId('sel', groupIndex, currentGroup.title, currentGroup.items.length, selectOption.value, selectOption.label),
                label: selectOption.label,
                value: selectOption.value,
            });
            return;
        }

        if (isLikelyInteractiveTitle(trimmed)) {
            flushText();
            flushGroup();
            if (pendingTitle) {
                appendText(pendingTitle);
            }
            pendingTitle = trimmed;
            return;
        }

        if (currentGroup) {
            flushGroup();
        }
        if (pendingTitle) {
            appendText(pendingTitle);
            pendingTitle = '';
        }
        appendText(rawLine);
    });

    if (currentGroup) {
        flushGroup();
    }
    if (pendingTitle) {
        appendText(pendingTitle);
    }
    flushText();

    return parts;
}

export function hasInteractiveSelection(parsed, messageIndex, interactiveStates, selectedOptions) {
    return parsed.some((part) => {
        if (part.type === 'checkbox') {
            return part.items.some((item) => interactiveStates[`${messageIndex}-${item.id}`]);
        }
        if (part.type === 'select') {
            return part.items.some((item) => selectedOptions[messageIndex] === item.id);
        }
        return false;
    });
}

export function buildInteractiveResponseText(parsed, messageIndex, interactiveStates, selectedOptions) {
    const responses = [];

    parsed.forEach((part) => {
        if (part.type === 'checkbox') {
            const selected = part.items
                .filter((item) => interactiveStates[`${messageIndex}-${item.id}`])
                .map((item) => item.label);

            if (selected.length > 0) {
                responses.push(selected.join('、'));
            }
        }

        if (part.type === 'select') {
            const selected = part.items.find((item) => selectedOptions[messageIndex] === item.id);
            if (selected) {
                responses.push(selected.label);
            }
        }
    });

    return responses.join('\n').trim();
}

export function collectInteractiveProgress(messages = [], interactiveStates = {}) {
    return messages.flatMap((message, messageIndex) => {
        if (message?.role !== 'ai' || typeof message?.content !== 'string') {
            return [];
        }

        const parsed = parseInteractiveContent(message.content.replace('[GOAL_COMPLETE]', '').trim());
        return parsed.flatMap((part, partIndex) => {
            if (part.type !== 'checkbox') {
                return [];
            }

            return part.items.map((item) => ({
                id: `${messageIndex}-${item.id}`,
                label: item.label,
                groupTitle: part.title || `Task group ${partIndex + 1}`,
                checked: Boolean(interactiveStates[`${messageIndex}-${item.id}`]),
            }));
        });
    });
}
