#!/usr/bin/env python3
"""v3 → v4 HttpApiEndpoint rewriter for chained builder style.

Turns
  HttpApiEndpoint.get("x", "/p").setPath(S).setUrlParams(Q).setPayload(P).addSuccess(R)
into
  HttpApiEndpoint.get("x", "/p", { params: S, query: Q, payload: P, success: R })
and `.addError(E)` chains on groups into the endpoints' `error: [...]`.
Expression extraction is paren-balanced, not regex-greedy.
"""
import re, sys

def balanced(s, i):
    """s[i] == '(' -> index after matching ')'"""
    depth = 0
    j = i
    in_str = None
    while j < len(s):
        c = s[j]
        if in_str:
            if c == '\\':
                j += 2; continue
            if c == in_str: in_str = None
        elif c in '"\'`':
            in_str = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: return j + 1
        j += 1
    raise ValueError('unbalanced')

KEYS = {'setPath': 'params', 'setUrlParams': 'query', 'setPayload': 'payload',
        'addSuccess': 'success', 'setHeaders': 'headers', 'addError': 'error'}

def rewrite(src, group_errors=None):
    out = []
    i = 0
    pat = re.compile(r'HttpApiEndpoint\.(get|post|put|patch|del|delete)\(')
    while True:
        m = pat.search(src, i)
        if not m:
            out.append(src[i:]); break
        out.append(src[i:m.start()])
        call_end = balanced(src, m.end() - 1)
        args = src[m.end():call_end - 1].strip().rstrip(',')
        j = call_end
        opts = []
        while True:
            k = j
            while k < len(src) and src[k] in ' \t\n': k += 1
            mm = re.match(r'\.(setPath|setUrlParams|setPayload|addSuccess|setHeaders|addError)\(', src[k:])
            if not mm: break
            p_open = k + mm.end() - 1
            p_close = balanced(src, p_open)
            expr = src[p_open + 1:p_close - 1].strip().rstrip(',')
            opts.append((KEYS[mm.group(1)], expr))
            j = p_close
        method = m.group(1)
        if group_errors:
            opts.append(('error', group_errors))
        if opts:
            body = ', '.join(f'{k}: {v}' for k, v in opts)
            out.append(f'HttpApiEndpoint.{"delete" if method=="del" else method}({args}, {{ {body} }})')
        else:
            out.append(f'HttpApiEndpoint.{"delete" if method=="del" else method}({args})')
        i = j
    return ''.join(out)

if __name__ == '__main__':
    path = sys.argv[1]
    errs = sys.argv[2] if len(sys.argv) > 2 else None
    s = open(path).read()
    s = rewrite(s, errs)
    if errs:
        s = re.sub(r'\n\t\.addError\([A-Za-z]+\)', '', s)
    open(path, 'w').write(s)
