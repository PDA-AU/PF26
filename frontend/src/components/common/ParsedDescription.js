import React, { useMemo } from 'react';

const splitMentionHashtagTokens = (text) => String(text || '').split(/(@[A-Za-z0-9_.-]+|#[A-Za-z0-9_.-]+)/g);
const splitUrlTokens = (text) => String(text || '').split(/(https?:\/\/[^\s<>"']+)/g);

const splitTrailingPunctuation = (value) => {
    let core = String(value || '');
    let suffix = '';
    while (core && /[),.!?;:\]]/.test(core.slice(-1))) {
        suffix = `${core.slice(-1)}${suffix}`;
        core = core.slice(0, -1);
    }
    return { core, suffix };
};

const renderUrlText = (text, keyPrefix) => {
    const tokens = splitUrlTokens(text);
    return tokens.filter(Boolean).map((token, index) => {
        if (!/^https?:\/\//i.test(token)) {
            return <React.Fragment key={`${keyPrefix}-u-t-${index}`}>{token}</React.Fragment>;
        }
        const { core, suffix } = splitTrailingPunctuation(token);
        if (!core) {
            return <React.Fragment key={`${keyPrefix}-u-e-${index}`}>{token}</React.Fragment>;
        }
        return (
            <React.Fragment key={`${keyPrefix}-u-l-${index}`}>
                <a
                    href={core}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-700 underline underline-offset-2 break-all hover:text-sky-800"
                >
                    {core}
                </a>
                {suffix ? <>{suffix}</> : null}
            </React.Fragment>
        );
    });
};

const renderMentionHashtagText = (text, keyPrefix) => {
    const tokens = splitMentionHashtagTokens(text);
    return tokens.filter(Boolean).map((token, index) => {
        if (token.startsWith('@')) {
            return (
                <span key={`${keyPrefix}-m-${index}`} className="font-semibold text-teal-700">
                    {token}
                </span>
            );
        }
        if (token.startsWith('#')) {
            return (
                <span key={`${keyPrefix}-h-${index}`} className="font-semibold text-orange-700">
                    {token}
                </span>
            );
        }
        return (
            <React.Fragment key={`${keyPrefix}-t-${index}`}>
                {renderUrlText(token, `${keyPrefix}-t-${index}`)}
            </React.Fragment>
        );
    });
};

const renderInlineDescription = (text, keyPrefix) => {
    const tokens = String(text || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return tokens.filter(Boolean).map((token, index) => {
        if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
            return (
                <strong key={`${keyPrefix}-b2-${index}`} className="font-extrabold text-black">
                    {renderMentionHashtagText(token.slice(2, -2), `${keyPrefix}-b2-${index}`)}
                </strong>
            );
        }
        if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
            return (
                <strong key={`${keyPrefix}-b-${index}`} className="font-extrabold text-black">
                    {renderMentionHashtagText(token.slice(1, -1), `${keyPrefix}-b-${index}`)}
                </strong>
            );
        }
        return (
            <React.Fragment key={`${keyPrefix}-n-${index}`}>
                {renderMentionHashtagText(token, `${keyPrefix}-n-${index}`)}
            </React.Fragment>
        );
    });
};

const splitSentences = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return [];
    const chunks = [];
    let segmentStart = 0;

    const isAlphaNum = (char) => /[A-Za-z0-9]/.test(char);
    const isWhitespace = (char) => /\s/.test(char);

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        if (!/[.!?]/.test(char)) continue;

        let cursor = index + 1;
        let sawWhitespace = false;
        while (cursor < normalized.length) {
            const lookAheadChar = normalized[cursor];
            if (isWhitespace(lookAheadChar)) {
                sawWhitespace = true;
                cursor += 1;
                continue;
            }
            if (isAlphaNum(lookAheadChar) && sawWhitespace) {
                const part = normalized.slice(segmentStart, cursor).trim();
                if (part) chunks.push(part);
                segmentStart = cursor;
            }
            break;
        }
    }

    const tail = normalized.slice(segmentStart).trim();
    if (tail) chunks.push(tail);
    return chunks;
};

export const parseDescriptionBlocks = (description) => {
    const source = String(description || '').replace(/\r/g, '').replace(/\\n/g, '\n');
    const rawLines = source.split('\n');
    const blocks = [];
    let listBuffer = [];

    const flushList = () => {
        if (!listBuffer.length) return;
        blocks.push({ type: 'list', items: [...listBuffer] });
        listBuffer = [];
    };

    rawLines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            return;
        }
        if (/^(-|\*|•)\s+/.test(line)) {
            const cleaned = line.replace(/^(-|\*|•)\s+/, '').trim();
            if (cleaned) listBuffer.push(cleaned);
            return;
        }
        if (/^\d+\.\s+/.test(line)) {
            const cleaned = line.replace(/^\d+\.\s+/, '').trim();
            if (cleaned) listBuffer.push(cleaned);
            return;
        }
        flushList();
        splitSentences(line).forEach((sentence) => {
            blocks.push({ type: 'text', text: sentence });
        });
    });

    flushList();
    return blocks;
};

export default function ParsedDescription({
    description,
    emptyText = null,
    listClassName = 'list-disc space-y-1 pl-5'
}) {
    const descriptionBlocks = useMemo(() => parseDescriptionBlocks(description), [description]);

    if (!descriptionBlocks.length) {
        return emptyText ? <p>{emptyText}</p> : null;
    }

    return (
        <>
            {descriptionBlocks.map((block, index) => {
                if (block.type === 'list') {
                    return (
                        <ul key={`desc-list-${index}`} className={listClassName}>
                            {block.items.map((item, itemIndex) => (
                                <li key={`desc-list-${index}-${itemIndex}`}>
                                    {renderInlineDescription(item, `desc-list-${index}-${itemIndex}`)}
                                </li>
                            ))}
                        </ul>
                    );
                }
                return (
                    <p key={`desc-text-${index}`}>
                        {renderInlineDescription(block.text, `desc-text-${index}`)}
                    </p>
                );
            })}
        </>
    );
}
