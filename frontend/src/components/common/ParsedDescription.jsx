import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const INTERACTIVE_TOKEN_REGEX = /(https?:\/\/[^\s<>"']+|@[A-Za-z0-9_.-]+|#[A-Za-z0-9_.-]+)/g;
const INTERACTIVE_SKIP_TAGS = new Set(['a', 'button', 'code', 'pre']);

const joinClassNames = (...values) => values.filter(Boolean).join(' ');

const splitTrailingPunctuation = (value) => {
    let core = String(value || '');
    let suffix = '';
    while (core && /[),.!?;:\]]/.test(core.slice(-1))) {
        suffix = `${core.slice(-1)}${suffix}`;
        core = core.slice(0, -1);
    }
    return { core, suffix };
};

const convertLegacySingleStarBold = (value) => String(value || '').replace(
    /(^|[([\{<\s])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?=$|[)\]}>.,!?;:\s])/g,
    (_, prefix, content) => `${prefix}**${content}**`,
);

export const prepareDescriptionMarkdown = (description) => convertLegacySingleStarBold(
    String(description || '')
        .replace(/\r/g, '')
        .replace(/\\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/^(\s*)•\s+/, '$1- '))
        .join('\n')
        .trim(),
);

// Kept as a compatibility export even though the renderer is now markdown-backed.
export const parseDescriptionBlocks = (description) => prepareDescriptionMarkdown(description);

const renderInteractiveText = (text, keyPrefix, { onHashtagClick } = {}) => String(text || '')
    .split(INTERACTIVE_TOKEN_REGEX)
    .filter((token) => token !== '')
    .map((token, index) => {
        if (/^https?:\/\//i.test(token)) {
            const { core, suffix } = splitTrailingPunctuation(token);
            if (!core) return token;
            return (
                <React.Fragment key={`${keyPrefix}-url-${index}`}>
                    <a
                        href={core}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-sky-700 underline underline-offset-2 break-all hover:text-sky-800"
                    >
                        {core}
                    </a>
                    {suffix}
                </React.Fragment>
            );
        }

        if (token.startsWith('@')) {
            const mentionValue = token.slice(1);
            return (
                <a
                    key={`${keyPrefix}-mention-${index}`}
                    href={`/persohub/${mentionValue}`}
                    className="font-semibold text-teal-700 underline underline-offset-2 break-all hover:text-teal-800"
                >
                    {token}
                </a>
            );
        }

        if (token.startsWith('#')) {
            const hashtagValue = token.slice(1);
            if (typeof onHashtagClick === 'function') {
                return (
                    <button
                        key={`${keyPrefix}-hashtag-${index}`}
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-orange-700 underline underline-offset-2 break-all hover:text-orange-800"
                        onClick={() => onHashtagClick(hashtagValue)}
                    >
                        {token}
                    </button>
                );
            }

            return (
                <a
                    key={`${keyPrefix}-hashtag-${index}`}
                    href={`/persohub?hashtag=${encodeURIComponent(hashtagValue)}`}
                    className="font-semibold text-orange-700 underline underline-offset-2 break-all hover:text-orange-800"
                >
                    {token}
                </a>
            );
        }

        return token;
    });

const enhanceInteractiveNode = (node, keyPrefix, options) => {
    if (typeof node === 'string') {
        return renderInteractiveText(node, keyPrefix, options);
    }

    if (typeof node === 'number' || typeof node === 'boolean' || node == null) {
        return node;
    }

    if (!React.isValidElement(node)) {
        return node;
    }

    const tagName = typeof node.type === 'string' ? node.type : null;
    if (tagName && INTERACTIVE_SKIP_TAGS.has(tagName)) {
        return node;
    }

    if (node.props?.children == null) {
        return node;
    }

    return React.cloneElement(
        node,
        undefined,
        enhanceInteractiveChildren(node.props.children, `${keyPrefix}-child`, options),
    );
};

const enhanceInteractiveChildren = (children, keyPrefix, options) => React.Children
    .toArray(children)
    .flatMap((child, index) => enhanceInteractiveNode(child, `${keyPrefix}-${index}`, options));

const deriveOrderedListClassName = (listClassName) => {
    if (/\blist-decimal\b/.test(listClassName)) {
        return listClassName;
    }
    if (/\blist-disc\b/.test(listClassName)) {
        return listClassName.replace(/\blist-disc\b/g, 'list-decimal');
    }
    return joinClassNames(listClassName, 'list-decimal');
};

const createMarkdownComponents = ({ listClassName, onHashtagClick }) => ({
    a: ({ node: _node, href, children, ...props }) => {
        const safeHref = String(href || '');
        const external = /^https?:\/\//i.test(safeHref);
        return (
            <a
                {...props}
                href={safeHref}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                className="font-semibold text-sky-700 underline underline-offset-2 break-all hover:text-sky-800"
            >
                {children}
            </a>
        );
    },
    em: ({ node: _node, children, ...props }) => <em {...props} className="italic">{children}</em>,
    li: ({ node: _node, children, ...props }) => (
        <li {...props}>
            {enhanceInteractiveChildren(children, 'desc-li', { onHashtagClick })}
        </li>
    ),
    ol: ({ node: _node, children, className, ...props }) => (
        <ol
            {...props}
            className={joinClassNames(className, deriveOrderedListClassName(listClassName))}
        >
            {children}
        </ol>
    ),
    p: ({ node: _node, children, ...props }) => (
        <p {...props}>
            {enhanceInteractiveChildren(children, 'desc-p', { onHashtagClick })}
        </p>
    ),
    strong: ({ node: _node, children, ...props }) => (
        <strong {...props} className="font-extrabold text-black">
            {children}
        </strong>
    ),
    ul: ({ node: _node, children, className, ...props }) => (
        <ul {...props} className={joinClassNames(className, listClassName)}>
            {children}
        </ul>
    ),
});

export default function ParsedDescription({
    description,
    emptyText = null,
    listClassName = 'list-disc space-y-1 pl-5',
    onHashtagClick,
}) {
    const markdownSource = useMemo(() => prepareDescriptionMarkdown(description), [description]);
    const markdownComponents = useMemo(
        () => createMarkdownComponents({ listClassName, onHashtagClick }),
        [listClassName, onHashtagClick],
    );

    if (!markdownSource) {
        return emptyText ? <p>{emptyText}</p> : null;
    }

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={markdownComponents}
        >
            {markdownSource}
        </ReactMarkdown>
    );
}
