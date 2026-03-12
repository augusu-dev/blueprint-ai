const LABELED_LINE_SEPARATORS = [':', '：'];

function findLabeledValue(text, labels) {
    const lines = String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        for (const label of labels) {
            for (const separator of LABELED_LINE_SEPARATORS) {
                const prefix = `${label}${separator}`;
                if (line.startsWith(prefix)) {
                    return line.slice(prefix.length).trim();
                }
            }
        }
    }

    return '';
}

function findFirstMatch(text, patterns) {
    const source = String(text || '');
    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) {
            return match[1].trim();
        }
        if (match?.[0]) {
            return match[0].trim();
        }
    }
    return '';
}

function normalizeDisplayValue(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[。]+$/g, '')
        .trim();
}

export function deriveStudySettings(sourceText = '') {
    const text = String(sourceText || '');

    const explicitDeadline = normalizeDisplayValue(
        findLabeledValue(text, ['期限', '締切', '試験日', '受験日', '目標日', 'deadline']),
    );

    const inferredDeadline = normalizeDisplayValue(findFirstMatch(text, [
        /(\d{4}[/-]\d{1,2}[/-]\d{1,2})/,
        /(\d{4}年\d{1,2}月\d{1,2}日)/,
        /(\d{1,2}月\d{1,2}日)/,
    ]));

    const explicitTimeline = normalizeDisplayValue(
        findLabeledValue(text, ['タイムライン', '期間', '学習期間', '目標までの期間']),
    );

    const inferredTimeline = normalizeDisplayValue(findFirstMatch(text, [
        /((?:約)?\d+\s*(?:年|ヶ月|か月|週間|週|日))/,
        /(平日は[^。\n]+休日は[^。\n]+)/,
    ]));

    const learningStyle = normalizeDisplayValue(
        findLabeledValue(text, ['学習スタイル', '学び方', '進め方', '学習ペース'])
        || findFirstMatch(text, [
            /(毎日少しずつ[^。\n]*)/,
            /(休日にまとめて[^。\n]*)/,
            /(通勤・通学中[^。\n]*)/,
            /(問題演習中心[^。\n]*)/,
            /(読むより手を動かす[^。\n]*)/,
        ]),
    );

    const deadlineLabel = explicitDeadline || inferredDeadline || '';
    const timelineLabel = explicitTimeline || inferredTimeline || '';
    const reviewCadenceLabel = '週2回のライトテスト';

    return {
        deadlineLabel,
        timelineLabel,
        learningStyleLabel: learningStyle,
        reviewCadenceLabel,
        deadlineDisplay: deadlineLabel || timelineLabel || '未設定',
    };
}
