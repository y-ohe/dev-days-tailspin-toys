import { createServer } from 'node:http';
import { join } from 'node:path';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { createIssueSubmitter, loadSentIssueNumbers } from './session-state.mjs';

const repository = 'y-ohe/dev-days-tailspin-toys';
const githubApi = `https://api.github.com/repos/${repository}/issues`;
const servers = new Map();

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Issue優先順位ボード - Tailspin Toys</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: var(--font-sans, system-ui, sans-serif);
      background: #0f172a;
      color: #f1f5f9;
      font-size: 15px;
      line-height: 1.55;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #0f172a; color: #f1f5f9; }
    main { max-width: 1440px; margin: 0 auto; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    h1 { margin: 0 0 6px; font-size: 1.8rem; line-height: 1.2; }
    h2 { margin: 0; font-size: 1.2rem; }
    p { margin: 0; }
    .muted { color: #cbd5e1; }
    .toolbar { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; margin: 24px 0; }
    label { display: grid; gap: 5px; color: #e2e8f0; font-weight: 600; }
    input, select, button {
      min-height: 42px;
      border: 1px solid #64748b;
      border-radius: 8px;
      padding: 8px 12px;
      background: #1e293b;
      color: #f8fafc;
      font: inherit;
    }
    input { min-width: min(320px, 80vw); }
    button { cursor: pointer; font-weight: 700; }
    button:hover:not(:disabled) { background: #334155; }
    button:disabled { cursor: not-allowed; opacity: .78; }
    :focus-visible { outline: 3px solid #facc15; outline-offset: 3px; }
    a { color: #93c5fd; text-decoration: underline; text-underline-offset: 3px; }
    a:hover { color: #bfdbfe; }
    #status { min-height: 1.6em; color: #fde68a; }
    .board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
    .lane { min-width: 0; padding: 16px; border: 1px solid #475569; border-radius: 12px; background: #111c30; }
    .lane-heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
    .count { border-radius: 999px; background: #334155; padding: 2px 10px; font-size: .9rem; }
    .cards { display: grid; gap: 12px; }
    article { min-width: 0; padding: 15px; border: 1px solid #475569; border-radius: 10px; background: #1e293b; }
    article h3 { margin: 7px 0; font-size: 1.08rem; line-height: 1.4; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .badge { display: inline-block; border-radius: 999px; padding: 2px 9px; background: #164e63; color: #cffafe; font-size: .85rem; font-weight: 700; }
    .reason { margin: 12px 0; border-left: 3px solid #facc15; padding: 8px 10px; background: #292419; color: #fef3c7; }
    details { margin-top: 12px; }
    summary { width: fit-content; cursor: pointer; color: #e2e8f0; font-weight: 600; }
    .body { margin-top: 9px; padding: 12px; max-height: 420px; overflow: auto; border-radius: 7px; background: #0b1220; color: #e2e8f0; white-space: pre-wrap; overflow-wrap: anywhere; font: .9rem/1.55 var(--font-mono, ui-monospace, monospace); }
    .card-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
    .sent { color: #86efac; font-weight: 700; }
    .empty { padding: 18px; color: #cbd5e1; border: 1px dashed #64748b; border-radius: 8px; }
    @media (max-width: 760px) {
      body { padding: 16px; }
      .board { grid-template-columns: 1fr; }
      .toolbar { align-items: stretch; }
      .toolbar label, .toolbar input, .toolbar select, .toolbar button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Issue優先順位ボード</h1>
        <p class="muted">GitHubから最新のOpen Issueを取得し、優先度と残りに整理します。</p>
        <p class="muted">優先理由ではmain反映済みの星評価 #12 と絞り込み #7 を考慮しています。</p>
      </div>
      <button id="refresh" type="button" data-testid="refresh-issues">Issueを再取得</button>
    </header>
    <div class="toolbar">
      <label for="search">Issueを検索
        <input id="search" type="search" placeholder="番号・タイトル・本文" data-testid="issue-search">
      </label>
      <label for="scope">表示する列
        <select id="scope" data-testid="issue-scope">
          <option value="all">すべて</option>
          <option value="priority">上位3件</option>
          <option value="remaining">残り</option>
        </select>
      </label>
    </div>
    <p id="status" role="status" aria-live="polite" data-testid="board-status"></p>
    <div class="board">
      <section class="lane" id="priority-lane" aria-labelledby="priority-heading">
        <div class="lane-heading"><h2 id="priority-heading">優先して着手（上位3件）</h2><span class="count" id="priority-count">0</span></div>
        <div class="cards" id="priority-cards"></div>
      </section>
      <section class="lane" id="remaining-lane" aria-labelledby="remaining-heading">
        <div class="lane-heading"><h2 id="remaining-heading">残りのOpen Issue</h2><span class="count" id="remaining-count">0</span></div>
        <div class="cards" id="remaining-cards"></div>
      </section>
    </div>
  </main>
  <script>
    const status = document.querySelector('#status');
    const priorityCards = document.querySelector('#priority-cards');
    const remainingCards = document.querySelector('#remaining-cards');
    const search = document.querySelector('#search');
    const scope = document.querySelector('#scope');
    let issues = [];
    let sentNumbers = new Set();

    function makeIssueCard(issue) {
      const article = document.createElement('article');
      article.dataset.testid = 'issue-card-' + issue.number;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const number = document.createElement('span');
      number.className = 'badge';
      number.textContent = '#' + issue.number;
      meta.append(number);
      if (issue.priority) {
        const priority = document.createElement('span');
        priority.className = 'badge';
        priority.textContent = '優先度 ' + issue.priority;
        meta.append(priority);
      }
      article.append(meta);
      const title = document.createElement('h3');
      title.textContent = issue.title;
      article.append(title);
      const link = document.createElement('a');
      link.href = issue.html_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'GitHubでIssue #' + issue.number + 'を開く';
      article.append(link);
      if (issue.reason) {
        const reason = document.createElement('p');
        reason.className = 'reason';
        reason.textContent = '優先理由: ' + issue.reason;
        article.append(reason);
      }
      const details = document.createElement('details');
      details.open = issue.priorityRank <= 3;
      const summary = document.createElement('summary');
      summary.textContent = 'Issue本文を表示';
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = issue.body || '本文はありません。';
      details.append(summary, body);
      article.append(details);
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.dataset.testid = 'add-issue-' + issue.number;
      const sentLabel = document.createElement('span');
      sentLabel.className = 'sent';
      sentLabel.setAttribute('aria-live', 'polite');
      function showSent(message) {
        addButton.disabled = true;
        addButton.textContent = 'このセッションに追加済み';
        sentLabel.textContent = message || '送信済み（再送不可）';
      }
      if (sentNumbers.has(issue.number)) {
        showSent();
      } else {
        addButton.textContent = '本文をこのセッションに追加（1回のみ）';
        addButton.addEventListener('click', async () => {
          addButton.disabled = true;
          addButton.textContent = '追加しています…';
          status.textContent = 'Issue #' + issue.number + ' の本文を追加しています。';
          try {
            const response = await fetch('/api/issues/' + issue.number + '/add', { method: 'POST' });
            const result = await response.json();
            if (response.ok || result.sent) {
              sentNumbers.add(issue.number);
              showSent(response.ok ? '送信済み（再送不可）' : '送信結果不明・重複防止のため再送不可');
            } else {
              addButton.disabled = false;
              addButton.textContent = '本文をこのセッションに追加（1回のみ）';
            }
            status.textContent = result.message || result.error || (response.ok ? 'Issue本文を追加しました。' : '追加に失敗しました。');
          } catch (error) {
            addButton.disabled = false;
            addButton.textContent = '本文をこのセッションに追加（1回のみ）';
            status.textContent = '追加に失敗しました: ' + error.message;
          }
        });
      }
      actions.append(addButton, sentLabel);
      article.append(actions);
      return article;
    }

    function render() {
      priorityCards.replaceChildren();
      remainingCards.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      const visible = issues.filter((issue) =>
        !query || ('#' + issue.number + ' ' + issue.title + ' ' + (issue.body || '')).toLocaleLowerCase().includes(query)
      );
      const priorities = visible.filter((issue) => issue.priorityRank <= 3);
      const remaining = visible.filter((issue) => issue.priorityRank > 3);
      document.querySelector('#priority-count').textContent = priorities.length;
      document.querySelector('#remaining-count').textContent = remaining.length;
      for (const issue of priorities) priorityCards.append(makeIssueCard(issue));
      for (const issue of remaining) remainingCards.append(makeIssueCard(issue));
      document.querySelector('#priority-lane').hidden = scope.value === 'remaining';
      document.querySelector('#remaining-lane').hidden = scope.value === 'priority';
      if (!issues.length) {
        priorityCards.innerHTML = '<p class="empty">Open Issueはありません。</p>';
      } else {
        if (!priorities.length && scope.value !== 'remaining') priorityCards.innerHTML = '<p class="empty">条件に一致するIssueはありません。</p>';
        if (!remaining.length && scope.value !== 'priority') remainingCards.innerHTML = '<p class="empty">条件に一致するIssueはありません。</p>';
      }
    }

    async function refreshIssues() {
      const refresh = document.querySelector('#refresh');
      refresh.disabled = true;
      status.textContent = 'GitHubから最新のOpen Issueを取得しています…';
      try {
        const response = await fetch('/api/issues');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'GitHubからIssueを取得できませんでした。');
        issues = result.issues;
        sentNumbers = new Set(result.sentNumbers);
        render();
        status.textContent = issues.length + '件のOpen Issueを取得しました。追加済みの状態はこのセッションで保持されています。';
      } catch (error) {
        status.textContent = 'Issueの再取得に失敗しました: ' + error.message;
      } finally {
        refresh.disabled = false;
      }
    }

    search.addEventListener('input', render);
    scope.addEventListener('change', render);
    document.querySelector('#refresh').addEventListener('click', refreshIssues);
    refreshIssues();
  </script>
</body>
</html>`;

function getPriority(issue) {
    const text = `${issue.title}\n${issue.body ?? ''}`.toLowerCase();
    if (/(sort|sorting|並べ替え|ソート)/.test(text) && /(star rating|rating|ratings|星評価|評価)/.test(text)) {
        return {
            score: 100,
            reason: 'mainに反映済みの星評価 #12 を並べ替えに活用でき、カテゴリ/パブリッシャー絞り込み #7 と組み合わせて比較しやすくなります。',
        };
    }
    if (/(search box|title search|search input|検索ボックス|検索)/.test(text) && /(filter|絞り込み)/.test(text)) {
        return {
            score: 90,
            reason: 'mainに反映済みの絞り込み #7 を補完するタイトル検索で、星評価 #12 のあるカタログから目的のゲームを探しやすくできます。',
        };
    }
    if (/(catalog summary|average star rating|total number of games|カタログ.*(summary|概要)|平均.*評価)/.test(text)) {
        return {
            score: 80,
            reason: 'mainに反映済みの星評価 #12 を集計し、絞り込み #7 を使う前にカタログ全体の規模と評価を伝えられます。',
        };
    }
    if (/(pagination|ページネーション)/.test(text)) {
        return { score: 60, reason: 'カタログが増えたときの表示負荷と閲覧性を改善します。既存の絞り込み #7 や星評価 #12 とも併用できます。' };
    }
    if (/(publisher page|publisher.*games|パブリッシャー.*ページ)/.test(text)) {
        return { score: 50, reason: '既存のパブリッシャー絞り込み #7 を、各社のゲーム一覧へ直接たどれるページに広げます。' };
    }
    if (/(description|説明)/.test(text)) {
        return { score: 40, reason: '既存のゲーム詳細ページに情報を加える改善です。星評価 #12 や絞り込み #7 を使った閲覧後の理解を深めます。' };
    }
    return { score: 10, reason: 'カタログ利用者への効果と既存の星評価 #12・絞り込み #7 との連携を考慮した候補です。' };
}

async function fetchOpenIssues() {
    let nextUrl = `${githubApi}?state=open&per_page=100&sort=created&direction=desc`;
    const issues = [];
    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Tailspin-Priority-Kanban',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status} ${response.statusText}`);
        }
        const page = await response.json();
        issues.push(...page.filter((issue) => !issue.pull_request));
        const link = response.headers.get('link') ?? '';
        nextUrl = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? '';
    }

    return issues
        .map((issue) => ({ ...issue, ...getPriority(issue) }))
        .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at) || b.number - a.number)
        .map((issue, index) => ({
            number: issue.number,
            title: issue.title,
            html_url: issue.html_url,
            body: issue.body ?? '',
            created_at: issue.created_at,
            priorityRank: index + 1,
            priority: index < 3 ? ['高', '高', '中'][index] : '',
            reason: index < 3 ? issue.reason : '',
        }));
}

function jsonResponse(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
}

let session;
let statePath;
let sentNumbers = new Set();
let addIssueOnce;
let stateReadyResolve;
let stateReadyReject;
const stateReady = new Promise((resolve, reject) => {
    stateReadyResolve = resolve;
    stateReadyReject = reject;
});

async function startServer() {
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        try {
            if (request.method === 'GET' && url.pathname === '/') {
                response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                response.end(html);
                return;
            }
            if (request.method === 'GET' && url.pathname === '/favicon.ico') {
                response.writeHead(204);
                response.end();
                return;
            }
            if (request.method === 'GET' && url.pathname === '/api/issues') {
                await stateReady;
                const openIssues = await fetchOpenIssues();
                jsonResponse(response, 200, { issues: openIssues, sentNumbers: [...sentNumbers] });
                return;
            }
            const addMatch = url.pathname.match(/^\/api\/issues\/(\d+)\/add$/);
            if (request.method === 'POST' && addMatch) {
                await stateReady;
                const issueNumber = Number(addMatch[1]);
                const result = await addIssueOnce(issueNumber);
                if (result.alreadySent) {
                    jsonResponse(response, 409, { sent: true, message: `Issue #${issueNumber} はこのセッションに追加済みです。再送は行いません。` });
                    return;
                }
                jsonResponse(response, 200, { sent: true, message: `Issue #${issueNumber} の本文をこのセッションに追加しました。` });
                return;
            }
            jsonResponse(response, 404, { error: 'Not found.' });
        } catch (error) {
            jsonResponse(response, 502, {
                error: error.message,
                sent: sentNumbers.has(Number(url.pathname.match(/^\/api\/issues\/(\d+)\/add$/)?.[1])),
            });
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not determine the canvas server port.');
    return { server, url: `http://127.0.0.1:${address.port}/` };
}

const canvas = createCanvas({
    id: 'priority-kanban',
    displayName: 'Issue優先順位ボード',
    description: 'このリポジトリの最新Open Issueを取得し、上位3件と残りに分けて表示するプロジェクト共有カンバンです。',
    open: async (context) => {
        await stateReady;
        let entry = servers.get(context.instanceId);
        if (!entry) {
            entry = await startServer();
            servers.set(context.instanceId, entry);
        }
        return { title: 'Issue優先順位ボード', url: entry.url };
    },
    onClose: async (context) => {
        const entry = servers.get(context.instanceId);
        if (entry) {
            servers.delete(context.instanceId);
            await new Promise((resolve, reject) => entry.server.close((error) => error ? reject(error) : resolve()));
        }
    },
});

session = await joinSession({ canvases: [canvas] });
if (!session.workspacePath) {
    throw new Error('Priority Kanban requires a session workspace to persist sent issue numbers.');
}
statePath = join(session.workspacePath, 'files', 'priority-kanban-state.json');
try {
    sentNumbers = await loadSentIssueNumbers(
        statePath,
        join(session.workspacePath, 'files', 'issue-priority-board-state.json'),
    );
    addIssueOnce = createIssueSubmitter({
        statePath,
        sentNumbers,
        fetchIssue: async (issueNumber) => {
            const response = await fetch(`${githubApi}/${issueNumber}`, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'Tailspin-Priority-Kanban',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });
            if (response.status === 404) throw new Error(`Issue #${issueNumber} no longer exists.`);
            if (!response.ok) throw new Error(`GitHub API returned ${response.status} ${response.statusText}`);
            return response.json();
        },
        session,
    });
    stateReadyResolve();
} catch (error) {
    stateReadyReject(error);
    throw error;
}
