import React, { createContext, useContext, useState, useEffect } from 'react';

const translations = {
    ja: {
        // Auth
        'auth.title': 'Blueprint AI',
        'auth.subtitle': 'AIワークフローを構築しましょう',
        'auth.email': 'メールアドレス',
        'auth.password': 'パスワード',
        'auth.signIn': 'ログイン',
        'auth.signUp': '新規登録',
        'auth.processing': '処理中...',
        'auth.footer': 'Powered by Supabase Auth',
        'auth.checkEmail': '確認メールを送信しました。メールをご確認ください。',
        'auth.unexpectedError': '予期しないエラーが発生しました。',
        'auth.noSupabase': 'Supabaseが設定されていません。.env.localにキーを追加してください。',

        // Home
        'home.title': '思考を直感的に組み上げよう。',
        'home.subtitle': 'Blueprintは直線的なチャットUIを置き換える、新次元のAI連携エディター。無限のキャンバスで高度なプロンプトフローを設計し、多彩なAIモデルを動的に操ることができます。',
        'home.newSpace': '新規スペースを開く',
        'home.logout': 'ログアウト',

        // Editor
        'editor.loading': 'Loading Space...',
        'editor.untitled': '無題のスペース',
        'editor.save': '保存',
        'editor.saving': '保存中...',
        'editor.ltr': '左から右へ',
        'editor.ttb': '上から下へ',
        'editor.settings': '設定',
        'editor.editTitle': 'タイトルを変更する',
        'editor.maxNodes': 'ノードの追加は1つのノードにつき最大10個までです。',
        'editor.saveError': '保存処理で問題が発生しました。',

        // Settings Modal
        'settings.title': '設定',
        'settings.langLabel': '表示言語',
        'settings.langJa': '日本語',
        'settings.langEn': 'English',
        'settings.langZh': '中文',
        'settings.security': 'APIキーはブラウザのローカル環境にのみ安全に保存されます。Blueprint AIのサーバー等へ送信されることは一切ありません。',
        'settings.securityLabel': 'セキュリティ設定:',
        'settings.apiHelp': '複数のプロバイダーのAPIキーを最大5つまで登録できます。「モデル」を空欄にするとデフォルトモデルが使用されます。',
        'settings.apiKey': 'APIキー',
        'settings.default': '(デフォルト)',
        'settings.delete': '削除',
        'settings.provider': 'プロバイダー',
        'settings.model': 'モデル名',
        'settings.modelDefault': 'デフォルト (自動選択)',
        'settings.secretKey': 'シークレットキー (API Key)',
        'settings.secretPlaceholder': 'のキーを貼り付けてください...',
        'settings.addKey': '+ 別のAPIキーを追加',
        'settings.logout': 'ログアウト',
        'settings.cancel': 'キャンセル',
        'settings.save': '保存',

        // Sidebar
        'sidebar.title': 'ワークスペース',
        'sidebar.newSpace': '新規チャット',
        'sidebar.history': '履歴',
        'sidebar.loading': '読み込み中...',
        'sidebar.empty': 'チャットがありません',
        'sidebar.search': '検索...',
        'sidebar.searchBtn': '検索',

        // Chat
        'chat.title': 'チャット',
        'chat.clearConfirm': 'チャット履歴を消去しますか？',
        'chat.clearBtn': 'チャット履歴を消去',
        'chat.modelSelect': 'モデル / APIキー選択',
        'chat.empty': 'メッセージを送信してチャットを始めましょう',
        'chat.generating': '応答を生成中...',
        'chat.placeholder': '質問してみましょう',
        'chat.shiftEnter': 'Shift+Enterで改行',
        'chat.noApiKey': 'APIキーが設定されていません',
        'chat.copy': 'コピー',
        'chat.copied': 'コピー済み',
        'chat.retry': 'もう一度',
        'chat.branch': '分岐',
        'chat.branchMax': '分岐上限(10)',
        'chat.moveTo': '移動',
        'chat.branchNum': '分岐',
        'chat.switchToNodes': 'ノードビュー',
        'chat.switchToChat': 'チャットに戻る',

        // Goal Wizard
        'goal.title': '🎯 目標を決める',
        'goal.back': 'チャットに戻る',
        'goal.placeholder': 'このスペースの目的や目標を教えてください...',
        'goal.thinking': '考え中...',
        'goal.complete': '目標設定が完了しました。チャットに戻ります...',

        // Nodes
        'node.addNode': 'ノードを追加',
        'node.systemPrompt': 'カスタマイズ指示 (System Prompt)',
        'node.systemPlaceholder': 'AIに対する事前指示...',
        'node.apiKeyLabel': '使用モデル / APIキー',
        'node.settings': '設定',
        'node.loopStrategy': 'ループ戦略 (Strategy)',
        'node.loopPerspective': '別視点からの分析',
        'node.loopQuiz': 'インタラクティブクイズ',
        'node.loopSummary': '自動要約ループ',

        // General
        'general.loading': '読み込み中...',
        'general.supabaseWarning': 'Warning: Supabase credentials are missing. Check .env.local file',
    },
    en: {
        'auth.title': 'Blueprint AI',
        'auth.subtitle': 'Build your AI workflows',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.signIn': 'Sign In',
        'auth.signUp': 'Sign Up',
        'auth.processing': 'Processing...',
        'auth.footer': 'Powered by Supabase Auth',
        'auth.checkEmail': 'Check your email for the confirmation link!',
        'auth.unexpectedError': 'An unexpected error occurred.',
        'auth.noSupabase': 'Error: Supabase is not configured. Please add keys to .env.local',

        'home.title': 'Build your ideas intuitively.',
        'home.subtitle': 'Blueprint replaces linear chat UIs with a next-gen AI-powered editor. Design advanced prompt flows on an infinite canvas and orchestrate diverse AI models dynamically.',
        'home.newSpace': 'Open New Space',
        'home.logout': 'Logout',

        'editor.loading': 'Loading Space...',
        'editor.untitled': 'Untitled Space',
        'editor.save': 'Save',
        'editor.saving': 'Saving...',
        'editor.ltr': 'Left to Right',
        'editor.ttb': 'Top to Bottom',
        'editor.settings': 'Settings',
        'editor.editTitle': 'Edit title',
        'editor.maxNodes': 'Max 10 nodes per source node.',
        'editor.saveError': 'An error occurred while saving.',

        'settings.title': 'Settings',
        'settings.langLabel': 'Language',
        'settings.langJa': '日本語',
        'settings.langEn': 'English',
        'settings.langZh': '中文',
        'settings.security': 'API keys are stored securely in your browser\'s local storage only. They are never sent to Blueprint AI servers.',
        'settings.securityLabel': 'Security:',
        'settings.apiHelp': 'Register up to 5 API keys from different providers. Leave "Model" empty to use the default model.',
        'settings.apiKey': 'API Key',
        'settings.default': '(Default)',
        'settings.delete': 'Delete',
        'settings.provider': 'Provider',
        'settings.model': 'Model',
        'settings.modelDefault': 'Default (Auto)',
        'settings.secretKey': 'Secret Key (API Key)',
        'settings.secretPlaceholder': ' key here...',
        'settings.addKey': '+ Add another API key',
        'settings.logout': 'Logout',
        'settings.cancel': 'Cancel',
        'settings.save': 'Save',

        'sidebar.title': 'Workspaces',
        'sidebar.newSpace': 'New Chat',
        'sidebar.history': 'History',
        'sidebar.loading': 'Loading...',
        'sidebar.empty': 'No chats yet',
        'sidebar.search': 'Search...',
        'sidebar.searchBtn': 'Search',

        'chat.title': 'Chat',
        'chat.clearConfirm': 'Clear chat history?',
        'chat.clearBtn': 'Clear chat history',
        'chat.modelSelect': 'Model / API Key',
        'chat.empty': 'Send a message to start chatting',
        'chat.generating': 'Generating response...',
        'chat.placeholder': 'Ask anything...',
        'chat.shiftEnter': 'Shift+Enter for newline',
        'chat.noApiKey': 'API key not set',
        'chat.copy': 'Copy',
        'chat.copied': 'Copied',
        'chat.retry': 'Retry',
        'chat.branch': 'Branch',
        'chat.branchMax': 'Branch limit (10)',
        'chat.moveTo': 'Go to',
        'chat.branchNum': 'Branch',
        'chat.switchToNodes': 'Node View',
        'chat.switchToChat': 'Back to Chat',

        'goal.title': '🎯 Set Goal',
        'goal.back': 'Back to Chat',
        'goal.placeholder': 'Describe the purpose or goal of this space...',
        'goal.thinking': 'Thinking...',
        'goal.complete': 'Goal setting complete. Returning to chat...',

        'node.addNode': 'Add node',
        'node.systemPrompt': 'System Prompt',
        'node.systemPlaceholder': 'Instructions for AI...',
        'node.apiKeyLabel': 'Model / API Key',
        'node.settings': 'Settings',
        'node.loopStrategy': 'Loop Strategy',
        'node.loopPerspective': 'Alternative perspective',
        'node.loopQuiz': 'Interactive quiz',
        'node.loopSummary': 'Auto-summary loop',

        'general.loading': 'Loading...',
        'general.supabaseWarning': 'Warning: Supabase credentials are missing. Check .env.local file.',
    },
    zh: {
        'auth.title': 'Blueprint AI',
        'auth.subtitle': '构建您的AI工作流',
        'auth.email': '邮箱',
        'auth.password': '密码',
        'auth.signIn': '登录',
        'auth.signUp': '注册',
        'auth.processing': '处理中...',
        'auth.footer': 'Powered by Supabase Auth',
        'auth.checkEmail': '请检查您的邮箱以确认！',
        'auth.unexpectedError': '发生了意外错误。',
        'auth.noSupabase': '错误：Supabase未配置。请在.env.local中添加密钥。',

        'home.title': '直觉构建你的想法。',
        'home.subtitle': 'Blueprint用下一代AI编辑器替代线性聊天UI。在无限画布上设计高级提示流程，动态编排多种AI模型。',
        'home.newSpace': '打开新空间',
        'home.logout': '退出登录',

        'editor.loading': '加载中...',
        'editor.untitled': '未命名空间',
        'editor.save': '保存',
        'editor.saving': '保存中...',
        'editor.ltr': '从左到右',
        'editor.ttb': '从上到下',
        'editor.settings': '设置',
        'editor.editTitle': '编辑标题',
        'editor.maxNodes': '每个节点最多添加10个子节点。',
        'editor.saveError': '保存时出现问题。',

        'settings.title': '设置',
        'settings.langLabel': '显示语言',
        'settings.langJa': '日本語',
        'settings.langEn': 'English',
        'settings.langZh': '中文',
        'settings.security': 'API密钥仅安全存储在浏览器本地存储中，绝不会发送到Blueprint AI服务器。',
        'settings.securityLabel': '安全设置：',
        'settings.apiHelp': '最多可注册5个不同提供商的API密钥。"模型"留空则使用默认模型。',
        'settings.apiKey': 'API密钥',
        'settings.default': '(默认)',
        'settings.delete': '删除',
        'settings.provider': '提供商',
        'settings.model': '模型',
        'settings.modelDefault': '默认（自动选择）',
        'settings.secretKey': '密钥 (API Key)',
        'settings.secretPlaceholder': ' 的密钥...',
        'settings.addKey': '+ 添加API密钥',
        'settings.logout': '退出登录',
        'settings.cancel': '取消',
        'settings.save': '保存',

        'sidebar.title': '工作区',
        'sidebar.newSpace': '新聊天',
        'sidebar.history': '历史',
        'sidebar.loading': '加载中...',
        'sidebar.empty': '暂无聊天',
        'sidebar.search': '搜索...',
        'sidebar.searchBtn': '搜索',

        'chat.title': '聊天',
        'chat.clearConfirm': '确定清除聊天记录？',
        'chat.clearBtn': '清除聊天记录',
        'chat.modelSelect': '模型 / API密钥',
        'chat.empty': '发送消息开始聊天',
        'chat.generating': '正在生成回复...',
        'chat.placeholder': '问点什么吧...',
        'chat.shiftEnter': 'Shift+Enter换行',
        'chat.noApiKey': '未设置API密钥',
        'chat.copy': '复制',
        'chat.copied': '已复制',
        'chat.retry': '重试',
        'chat.branch': '分支',
        'chat.branchMax': '分支上限(10)',
        'chat.moveTo': '前往',
        'chat.branchNum': '分支',
        'chat.switchToNodes': '节点视图',
        'chat.switchToChat': '返回聊天',

        'goal.title': '🎯 设定目标',
        'goal.back': '返回聊天',
        'goal.placeholder': '描述此空间的目的或目标...',
        'goal.thinking': '思考中...',
        'goal.complete': '目标设定完成，返回聊天...',

        'node.addNode': '添加节点',
        'node.systemPrompt': '系统提示',
        'node.systemPlaceholder': '对AI的预设指令...',
        'node.apiKeyLabel': '模型 / API密钥',
        'node.settings': '设置',
        'node.loopStrategy': '循环策略',
        'node.loopPerspective': '多角度分析',
        'node.loopQuiz': '交互式测验',
        'node.loopSummary': '自动摘要循环',

        'general.loading': '加载中...',
        'general.supabaseWarning': '警告：Supabase凭据缺失。请检查.env.local文件。',
    }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(() => {
        return localStorage.getItem('blueprint_lang') || 'ja';
    });

    useEffect(() => {
        localStorage.setItem('blueprint_lang', lang);
    }, [lang]);

    const t = (key) => {
        return translations[lang]?.[key] || translations['ja']?.[key] || key;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
}
