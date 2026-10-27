import { useEffect, useState, type FormEvent } from 'react';
import { cloudSyncConfigured } from './supabase';
import { useCloudSyncStore } from './syncStore';

export function CloudSyncControls() {
  const session = useCloudSyncStore((state) => state.session);
  const status = useCloudSyncStore((state) => state.status);
  const initialized = useCloudSyncStore((state) => state.initialized);
  const message = useCloudSyncStore((state) => state.message);
  const [open, setOpen] = useState(false);
  useEffect(() => useCloudSyncStore.getState().start(), []);

  const stateLabel = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing…' : status === 'offline' ? 'Offline' : status === 'error' ? 'Sync error' : session ? 'Setup sync' : 'Sign in';
  return <>
    <button className={`sync-trigger sync-${status}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(true)} title={message} aria-label={`Cloud sync: ${stateLabel}`}>
      <span className="sync-indicator" aria-hidden />{stateLabel}
    </button>
    {open && <div className="sync-backdrop" onClick={() => setOpen(false)}>
      <section className="sync-panel" role="dialog" aria-modal="true" aria-label="Cloud sync" onClick={(event) => event.stopPropagation()}>
        <button className="lightbox-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <h2>Cloud sync</h2>
        <p className={`sync-message sync-${status}`} role="status">{message}</p>
        {!cloudSyncConfigured ? <>
          <p>同期を有効にするには、SupabaseのURLとpublishable keyを環境変数に設定してください。ローカル保存はそのまま利用できます。</p>
          <code>VITE_SUPABASE_URL<br />VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </> : !session ? <AuthForm /> : <>
          <p className="sync-account">{session.user.email}</p>
          {initialized === false && <div className="sync-bootstrap">
            <h3>初回同期</h3>
            <p><strong>仕事PC</strong>で、このPCに正データがあることを確認してからアップロードしてください。自宅PCのデータを選んでクラウドを初期化しないでください。</p>
            <button className="btn btn-primary" onClick={() => {
              if (window.confirm('Use this only on the work PC that holds the original maps. This initializes the cloud once and cannot be undone here. Continue?')) {
                void useCloudSyncStore.getState().uploadMaster().catch(() => undefined);
              }
            }}>このPCのデータをクラウドへ保存（元データPC）</button>
            <button className="btn" onClick={() => void useCloudSyncStore.getState().downloadMaster().catch(() => undefined)}>クラウドのデータをこのPCへ読み込む（受取PC）</button>
            <small>クラウドが未初期化なら受取操作は拒否され、このPCのデータは変更されません。</small>
          </div>}
          {initialized === true && <div className="sync-actions">
            <button className="btn" onClick={() => void useCloudSyncStore.getState().syncNow()}>Sync now</button>
            <span>同期元・受取先の区別なく、更新日時に基づいて同期します。</span>
          </div>}
          <button className="btn-link" onClick={() => void useCloudSyncStore.getState().signOut().catch(() => undefined)}>Sign out</button>
        </>}
        <button className="btn-link sync-close" onClick={() => setOpen(false)}>閉じる</button>
      </section>
    </div>}
  </>;
}

function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await useCloudSyncStore.getState().signIn(email.trim(), password, createAccount); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ログインに失敗しました。'); }
    finally { setBusy(false); }
  };
  return <form className="sync-auth-form" onSubmit={(event) => void submit(event)}>
    <h3>{createAccount ? 'Create account' : 'Sign in'}</h3>
    <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" required minLength={8} autoComplete={createAccount ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="sync-error" role="alert">{error}</p>}
    <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : createAccount ? 'Create account' : 'Sign in'}</button>
    <button className="btn-link" type="button" onClick={() => { setCreateAccount((value) => !value); setError(''); }}>{createAccount ? 'Already have an account? Sign in' : 'Create a sync account'}</button>
  </form>;
}
