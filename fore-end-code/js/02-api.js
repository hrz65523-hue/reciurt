/* =====================================================================
 * 02-api.js
 * 请求封装 + Mock 接口实现
 * 约定：所有接口统一出参 { code, message, data }
 *       code=200 成功；401 未登录；403 无权限；400 参数/状态非法；404 资源不存在；409 冲突
 * 下方 Mock 的键 "METHOD /path" 与《接口文档.md》逐条对应，
 * 关闭 API_CONFIG.useMock 后，前端会以相同路径请求真实后端，页面代码无需改动。
 * ===================================================================== */

/* ---------- 统一响应构造 ---------- */
function resp(data, message) { return { code: 200, message: message || '操作成功', data: data === undefined ? null : data }; }
function pageResp(list, pageNum, pageSize) {
  const pn = Number(pageNum) || 1, ps = Number(pageSize) || 10;
  return resp({ total: list.length, pageNum: pn, pageSize: ps, pages: Math.ceil(list.length / ps) || 0, list: list.slice((pn - 1) * ps, pn * ps) });
}
function nextId(arr) { return arr.reduce((m, x) => Math.max(m, x.id), 0) + 1; }
function nowStr() { return daysAgo(0); }
function permOf(user) { const r = DB.roles.find(x => x.id === user.roleId); return r ? r.permissions.slice() : []; }
function userOf(token) { return DB.users.find(x => x.username === token); }
function userInfoOf(u) {
  const r = DB.roles.find(x => x.id === u.roleId) || {};
  return { id: u.id, username: u.username, realName: u.realName, avatar: '', phone: u.phone, email: u.email, deptId: u.deptId, deptName: (DB.depts.find(d => d.id === u.deptId) || {}).name || '', roleCode: r.code, roleName: r.name };
}

const Mock = {};
const M = (key, fn) => { Mock[key] = fn; };

/* ============ 1. 认证与鉴权 ============ */
M('POST /auth/login', (b) => {
  const u = DB.users.find(x => x.username === b.username);
  if (!u || u.password !== b.password) return { code: 401, message: '用户名或密码错误', data: null };
  if (u.status !== 1) return { code: 403, message: '该账号已被停用，请联系管理员', data: null };
  return resp({ token: u.username, tokenType: 'Bearer', expiresIn: 7200, userInfo: userInfoOf(u), permissions: permOf(u) }, '登录成功');
});
M('POST /auth/register', (b) => {
  if (DB.users.some(u => u.username === b.username)) return { code: 409, message: '用户名已被注册', data: null };
  const u = { id: nextId(DB.users), username: b.username, password: b.password, realName: b.realName, roleId: 4, deptId: null, phone: b.phone || '', email: b.email || '', status: 1, createTime: nowStr() };
  DB.users.push(u);
  return resp(u.id, '注册成功');
});
M('POST /auth/logout', () => resp(null, '退出成功'));
M('GET /auth/info', (b, q, token) => {
  const u = userOf(token);
  if (!u) return { code: 401, message: '登录状态已失效，请重新登录', data: null };
  return resp({ userInfo: userInfoOf(u), permissions: permOf(u) });
});
M('PUT /auth/password', (b, q, token) => {
  const u = userOf(token);
  if (!u) return { code: 401, message: '登录状态已失效', data: null };
  if (u.password !== b.oldPassword) return { code: 400, message: '原密码不正确', data: null };
  u.password = b.newPassword;
  return resp(true, '密码修改成功');
});

/* ============ 2. 用户管理 ============ */
M('GET /system/users', (b, q) => {
  let list = DB.users.map(u => Object.assign({}, u, {
    roleName: (DB.roles.find(r => r.id === u.roleId) || {}).name,
    deptName: (DB.depts.find(d => d.id === u.deptId) || {}).name || '-'
  })).map(({ password, ...rest }) => rest);
  if (q.keyword) list = list.filter(u => (u.username + u.realName + (u.phone || '')).includes(q.keyword));
  if (q.roleId) list = list.filter(u => u.roleId === Number(q.roleId));
  if (q.status !== undefined && q.status !== '') list = list.filter(u => u.status === Number(q.status));
  return pageResp(list, q.pageNum, q.pageSize);
});
M('POST /system/users', (b) => {
  if (!b.username || !b.realName) return { code: 400, message: '用户名与姓名不能为空', data: null };
  if (DB.users.some(u => u.username === b.username)) return { code: 409, message: '用户名已存在', data: null };
  const u = Object.assign({ id: nextId(DB.users), password: b.password || '123456', status: 1, createTime: nowStr() }, b);
  DB.users.push(u);
  return resp(u.id, '新增用户成功');
});
M('PUT /system/users/{id}', (b, q, t, id) => {
  const u = DB.users.find(x => x.id === Number(id));
  if (!u) return { code: 404, message: '用户不存在', data: null };
  const pwd = u.password;
  Object.assign(u, b, { password: b.password || pwd });
  return resp(true, '更新成功');
});
M('DELETE /system/users/{id}', (b, q, t, id) => {
  if (Number(id) === 1) return { code: 400, message: '超级管理员账号不允许删除', data: null };
  DB.users = DB.users.filter(x => x.id !== Number(id));
  return resp(true, '删除成功');
});
M('PUT /system/users/{id}/status', (b, q, t, id) => {
  const u = DB.users.find(x => x.id === Number(id));
  if (!u) return { code: 404, message: '用户不存在', data: null };
  if (u.id === 1 && Number(b.status) === 0) return { code: 400, message: '超级管理员不允许停用', data: null };
  u.status = Number(b.status);
  return resp(true, '状态更新成功');
});
M('PUT /system/users/{id}/password', (b, q, t, id) => {
  const u = DB.users.find(x => x.id === Number(id));
  if (!u) return { code: 404, message: '用户不存在', data: null };
  u.password = b.password || '123456';
  return resp(true, '密码重置成功');
});

/* ============ 3. 角色与权限 ============ */
M('GET /system/roles', (b, q) => {
  let list = DB.roles.map(r => Object.assign({}, r, {
    userCount: DB.users.filter(u => u.roleId === r.id).length,
    permCount: r.permissions.length
  }));
  if (q.keyword) list = list.filter(r => (r.name + r.code).includes(q.keyword));
  return pageResp(list, q.pageNum, q.pageSize);
});
M('GET /system/roles/all', () => resp(DB.roles.map(r => ({ id: r.id, code: r.code, name: r.name }))));
M('POST /system/roles', (b) => {
  if (DB.roles.some(r => r.code === b.code)) return { code: 409, message: '角色编码已存在', data: null };
  const r = Object.assign({ id: nextId(DB.roles), status: 1, permissions: [] }, b);
  DB.roles.push(r);
  return resp(r.id, '新增角色成功');
});
M('PUT /system/roles/{id}', (b, q, t, id) => {
  const r = DB.roles.find(x => x.id === Number(id));
  if (!r) return { code: 404, message: '角色不存在', data: null };
  Object.assign(r, b, { code: r.code });   // 角色编码不可修改
  return resp(true, '更新成功');
});
M('DELETE /system/roles/{id}', (b, q, t, id) => {
  const rid = Number(id);
  if ([1, 2, 3, 4].includes(rid)) return { code: 400, message: '内置角色不允许删除', data: null };
  if (DB.users.some(u => u.roleId === rid)) return { code: 400, message: '该角色下存在用户，无法删除', data: null };
  DB.roles = DB.roles.filter(r => r.id !== rid);
  return resp(true, '删除成功');
});
M('GET /system/roles/{id}/permissions', (b, q, t, id) => {
  const r = DB.roles.find(x => x.id === Number(id));
  return r ? resp(r.permissions) : { code: 404, message: '角色不存在', data: null };
});
M('PUT /system/roles/{id}/permissions', (b, q, t, id) => {
  const r = DB.roles.find(x => x.id === Number(id));
  if (!r) return { code: 404, message: '角色不存在', data: null };
  r.permissions = b.permissions || [];
  return resp(true, '权限分配成功');
});
M('GET /system/permissions', () => resp(PERMISSION_TREE));

/* ============ 4. 企业与部门 ============ */
M('GET /system/depts/tree', () => {
  const build = (pid) => DB.depts.filter(d => d.parentId === pid).sort((a, b) => a.sort - b.sort)
    .map(d => Object.assign({}, d, { children: build(d.id) }));
  return resp(build(0));
});
M('POST /system/depts', (b) => {
  const d = Object.assign({ id: nextId(DB.depts), status: 1, sort: 99 }, b);
  DB.depts.push(d);
  return resp(d.id, '新增成功');
});
M('PUT /system/depts/{id}', (b, q, t, id) => {
  const d = DB.depts.find(x => x.id === Number(id));
  if (!d) return { code: 404, message: '部门不存在', data: null };
  if (Number(b.parentId) === Number(id)) return { code: 400, message: '上级部门不能是自己', data: null };
  Object.assign(d, b);
  return resp(true, '更新成功');
});
M('DELETE /system/depts/{id}', (b, q, t, id) => {
  const did = Number(id);
  if (DB.depts.some(d => d.parentId === did)) return { code: 400, message: '存在下级部门，无法删除', data: null };
  if (DB.users.some(u => u.deptId === did)) return { code: 400, message: '该部门下存在用户，无法删除', data: null };
  DB.depts = DB.depts.filter(d => d.id !== did);
  return resp(true, '删除成功');
});

/* ============ 5. 职位类别 ============ */
M('GET /job/categories', () => resp(DB.jobCategories.slice().sort((a, b) => a.sort - b.sort)));
M('POST /job/categories', (b) => {
  if (DB.jobCategories.some(c => c.name === b.name)) return { code: 409, message: '类别名称已存在', data: null };
  const c = Object.assign({ id: nextId(DB.jobCategories), status: 1, sort: 99 }, b);
  DB.jobCategories.push(c);
  return resp(c.id, '新增成功');
});
M('PUT /job/categories/{id}', (b, q, t, id) => {
  const c = DB.jobCategories.find(x => x.id === Number(id));
  if (!c) return { code: 404, message: '类别不存在', data: null };
  Object.assign(c, b);
  return resp(true, '更新成功');
});
M('DELETE /job/categories/{id}', (b, q, t, id) => {
  const cid = Number(id);
  if (DB.jobs.some(j => j.categoryId === cid)) return { code: 400, message: '该类别下存在职位，无法删除', data: null };
  DB.jobCategories = DB.jobCategories.filter(c => c.id !== cid);
  return resp(true, '删除成功');
});

/* ============ 6. 职位管理 ============ */
M('GET /jobs', (b, q) => {
  let list = DB.jobs.slice();
  if (q.keyword) list = list.filter(j => j.title.includes(q.keyword));
  if (q.categoryId) list = list.filter(j => j.categoryId === Number(q.categoryId));
  if (q.deptId) list = list.filter(j => j.deptId === Number(q.deptId));
  if (q.status !== undefined && q.status !== '') list = list.filter(j => j.status === Number(q.status));
  if (q.city) list = list.filter(j => j.city === q.city);
  if (q.jobType) list = list.filter(j => j.jobType === Number(q.jobType));
  list.sort((a, b) => b.id - a.id);
  const mapped = list.map(j => Object.assign({}, j, {
    categoryName: (DB.jobCategories.find(c => c.id === j.categoryId) || {}).name,
    deptName: (DB.depts.find(d => d.id === j.deptId) || {}).name,
    jobTypeName: JOB_TYPE[j.jobType],
    statusName: JOB_STATUS[j.status],
    applyCount: DB.applications.filter(a => a.jobId === j.id).length
  }));
  return pageResp(mapped, q.pageNum, q.pageSize);
});
M('GET /jobs/{id}', (b, q, t, id) => {
  const j = DB.jobs.find(x => x.id === Number(id));
  if (!j) return { code: 404, message: '职位不存在', data: null };
  return resp(Object.assign({}, j, {
    categoryName: (DB.jobCategories.find(c => c.id === j.categoryId) || {}).name,
    deptName: (DB.depts.find(d => d.id === j.deptId) || {}).name,
    jobTypeName: JOB_TYPE[j.jobType]
  }));
});
M('POST /jobs', (b) => {
  if (!b.title) return { code: 400, message: '职位名称不能为空', data: null };
  const j = Object.assign({ id: nextId(DB.jobs), status: 0, views: 0, applies: 0, publishTime: null, createTime: nowStr(), createBy: 2 }, b);
  DB.jobs.push(j);
  return resp(j.id, '职位已保存为草稿');
});
M('PUT /jobs/{id}', (b, q, t, id) => {
  const j = DB.jobs.find(x => x.id === Number(id));
  if (!j) return { code: 404, message: '职位不存在', data: null };
  Object.assign(j, b);
  return resp(true, '更新成功');
});
M('DELETE /jobs/{id}', (b, q, t, id) => {
  const jid = Number(id);
  if (DB.applications.some(a => a.jobId === jid)) return { code: 400, message: '该职位已收到投递，不能删除，请改为下线', data: null };
  DB.jobs = DB.jobs.filter(j => j.id !== jid);
  return resp(true, '删除成功');
});
/* 上下架：0草稿 1招聘中 2已下线 3已关闭 */
M('PUT /jobs/{id}/status', (b, q, t, id) => {
  const j = DB.jobs.find(x => x.id === Number(id));
  if (!j) return { code: 404, message: '职位不存在', data: null };
  const s = Number(b.status);
  if (![0, 1, 2, 3].includes(s)) return { code: 400, message: '非法的职位状态', data: null };
  if (s === 1) {
    if (j.status === 3) return { code: 400, message: '已关闭的职位不可重新发布', data: null };
    j.publishTime = j.publishTime || nowStr();
    j.offlineReason = '';
  }
  if (s === 2) j.offlineReason = b.reason || '';
  if (s === 3) j.closeReason = b.reason || '';
  j.status = s;
  return resp(true, ({ 0: '已转为草稿', 1: '发布成功', 2: '已下线', 3: '已关闭' })[s]);
});

/* ============ 7. 应聘者门户（公开接口） ============ */
M('GET /portal/jobs', (b, q) => {
  let list = DB.jobs.filter(j => j.status === 1);
  if (q.keyword) list = list.filter(j => (j.title + (j.tags || []).join('')).includes(q.keyword));
  if (q.categoryId) list = list.filter(j => j.categoryId === Number(q.categoryId));
  if (q.city) list = list.filter(j => j.city === q.city);
  if (q.jobType) list = list.filter(j => j.jobType === Number(q.jobType));
  list.sort((a, b) => (b.publishTime || '').localeCompare(a.publishTime || ''));
  const mapped = list.map(j => Object.assign({}, j, {
    categoryName: (DB.jobCategories.find(c => c.id === j.categoryId) || {}).name,
    deptName: (DB.depts.find(d => d.id === j.deptId) || {}).name,
    jobTypeName: JOB_TYPE[j.jobType],
    applyCount: DB.applications.filter(a => a.jobId === j.id).length
  }));
  return pageResp(mapped, q.pageNum, q.pageSize || 8);
});
M('POST /portal/jobs/{id}/view', (b, q, t, id) => {
  const j = DB.jobs.find(x => x.id === Number(id));
  if (!j) return { code: 404, message: '职位不存在或已下线', data: null };
  j.views++;
  return resp({ views: j.views });
});

/* ============ 8. 简历解析与投递 ============ */
M('POST /resume/upload', (b, q) => {
  const name = q.fileName || 'resume.pdf';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['exe', 'zip', 'rar', 'bat'].includes(ext)) return { code: 400, message: '仅支持 PDF / DOC / DOCX 格式的简历文件', data: null };
  return resp({ fileName: name, fileUrl: '/files/resume/' + Date.now() + '.' + ext, fileSize: Math.floor(120 + Math.random() * 400) + 'KB' }, '上传成功');
});
M('POST /resume/parse', (b) => {
  if (!b.fileName) return { code: 400, message: '未接收到简历文件', data: null };
  const name = rndOf(FAMILY) + rndOf(GIVEN_M.concat(GIVEN_F));
  return resp({
    candidateName: name, gender: Math.random() > 0.5 ? 1 : 2,
    age: 22 + Math.floor(Math.random() * 10),
    phone: '13' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
    email: 'parse' + Date.now() + '@example.com',
    education: rndOf(['本科', '硕士', '大专']), school: rndOf(SCHOOLS),
    major: rndOf(MAJORS), workYears: rndOf(['应届生', '1-3年', '3-5年']),
    latestCompany: rndOf(COMPANIES),
    skills: [rndOf(['Java', 'Vue3', 'Python']), rndOf(['MySQL', 'Redis', 'Docker'])],
    selfEval: '（由简历解析自动提取）工作认真负责，具备良好的团队协作与学习能力。',
    parseRate: 0.92
  }, '简历解析成功');
});
M('POST /applications', (b) => {
  const j = DB.jobs.find(x => x.id === Number(b.jobId));
  if (!j) return { code: 404, message: '职位不存在', data: null };
  if (j.status !== 1) return { code: 400, message: '该职位已停止接收简历', data: null };
  if (!b.candidateName || !b.phone) return { code: 400, message: '姓名与手机号为必填项', data: null };
  if (DB.applications.some(a => a.jobId === j.id && a.phone === b.phone)) {
    return { code: 409, message: '您已投递过该职位，请勿重复投递', data: null };
  }
  const app = Object.assign({
    id: nextId(DB.applications), jobTitle: j.title, status: 1, parsed: b.parsed || 0,
    tagIds: [], score: null, source: b.source || '官网投递',
    applyTime: nowStr(), updateTime: nowStr()
  }, b);
  DB.applications.push(app);
  j.applies = DB.applications.filter(a => a.jobId === j.id).length;
  DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 0, toStatus: 1, operator: app.candidateName, remark: '在线投递简历', createTime: nowStr() });
  return resp({ id: app.id, jobTitle: j.title }, '投递成功，请留意后续通知');
});
M('GET /applications', (b, q) => {
  let list = DB.applications.slice();
  const me = userOf(q.__token);
  if (q.mine === 'true' || q.mine === '1') {
    if (!me) return { code: 401, message: '请先登录', data: null };
    list = list.filter(a => a.candidateName === me.realName || a.email === me.email);
  }
  if (q.jobId) list = list.filter(a => a.jobId === Number(q.jobId));
  if (q.keyword) list = list.filter(a => (a.candidateName + a.phone + (a.school || '')).includes(q.keyword));
  if (q.status) list = list.filter(a => String(a.status) === String(q.status));
  if (q.tagId) list = list.filter(a => a.tagIds.includes(Number(q.tagId)));
  if (q.source) list = list.filter(a => a.source === q.source);
  if (q.education) list = list.filter(a => a.education === q.education);
  list.sort((a, b) => b.id - a.id);
  const mapped = list.map(a => Object.assign({}, a, {
    statusName: APP_STATUS[a.status], statusType: APP_STATUS_TYPE[a.status],
    tagList: DB.tags.filter(t => a.tagIds.includes(t.id)),
    interviewCount: DB.interviews.filter(i => i.applicationId === a.id).length
  }));
  return pageResp(mapped, q.pageNum, q.pageSize);
});
M('GET /applications/{id}', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  return resp(Object.assign({}, a, {
    statusName: APP_STATUS[a.status], statusType: APP_STATUS_TYPE[a.status],
    tagList: DB.tags.filter(t => a.tagIds.includes(t.id)),
    job: DB.jobs.find(j => j.id === a.jobId) || null,
    interviews: DB.interviews.filter(i => i.applicationId === a.id),
    flowLogs: DB.flowLogs.filter(f => f.applicationId === a.id).sort((x, y) => x.id - y.id)
  }));
});
M('DELETE /applications/{id}', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  if (![1, 3, 9].includes(a.status)) return { code: 400, message: '该投递已进入面试流程，无法撤回', data: null };
  DB.applications = DB.applications.filter(x => x.id !== Number(id));
  return resp(true, '已撤回投递');
});

/* ============ 9. 招聘流程：状态流转 ============ */
M('POST /applications/{id}/flow', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  const to = Number(b.toStatus);
  const allowed = (FLOW[a.status] || []).map(x => x.to);
  if (!allowed.includes(to)) {
    return { code: 400, message: '非法的状态流转：' + APP_STATUS[a.status] + ' → ' + (APP_STATUS[to] || to), data: null };
  }
  const me = userOf(t);
  DB.flowLogs.push({
    id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: to,
    operator: (me && me.realName) || b.operator || '系统', remark: b.remark || '', createTime: nowStr()
  });
  a.status = to;
  a.updateTime = nowStr();
  if (b.remark && [2, 3].includes(to)) a.screenRemark = b.remark;
  return resp({ status: to, statusName: APP_STATUS[to] }, '流转成功');
});
M('GET /applications/{id}/flow-logs', (b, q, t, id) => {
  const list = DB.flowLogs.filter(f => f.applicationId === Number(id)).sort((a, b) => a.id - b.id)
    .map(f => Object.assign({}, f, { fromName: APP_STATUS[f.fromStatus] || '—', toName: APP_STATUS[f.toStatus] || '—' }));
  return resp(list);
});
/* 批量筛选：一次处理多条，非法的单条跳过并在结果中说明 */
M('POST /applications/batch-flow', (b) => {
  const results = [];
  (b.ids || []).forEach(id => {
    const a = DB.applications.find(x => x.id === Number(id));
    if (!a) { results.push({ id: id, success: false, message: '记录不存在' }); return; }
    const allowed = (FLOW[a.status] || []).map(x => x.to);
    if (!allowed.includes(Number(b.toStatus))) { results.push({ id: id, success: false, message: '当前状态为「' + APP_STATUS[a.status] + '」，不可流转' }); return; }
    DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: Number(b.toStatus), operator: b.operator || '龚清', remark: b.remark || '批量操作', createTime: nowStr() });
    a.status = Number(b.toStatus);
    results.push({ id: id, success: true });
  });
  const ok = results.filter(r => r.success).length;
  return resp({ total: results.length, success: ok, fail: results.length - ok, results }, '批量处理完成：成功 ' + ok + ' 条');
});

/* ============ 10. 标签 ============ */
M('GET /tags', () => resp(DB.tags));
M('POST /tags', (b) => {
  if (!b.name) return { code: 400, message: '标签名称不能为空', data: null };
  if (DB.tags.some(t => t.name === b.name)) return { code: 409, message: '标签名称已存在', data: null };
  const t2 = { id: nextId(DB.tags), name: b.name, color: b.color || '#2f6fed' };
  DB.tags.push(t2);
  return resp(t2.id, '新增成功');
});
M('PUT /tags/{id}', (b, q, t, id) => {
  const t2 = DB.tags.find(x => x.id === Number(id));
  if (!t2) return { code: 404, message: '标签不存在', data: null };
  Object.assign(t2, b);
  return resp(true, '更新成功');
});
M('DELETE /tags/{id}', (b, q, t, id) => {
  const tid = Number(id);
  DB.tags = DB.tags.filter(x => x.id !== tid);
  DB.applications.forEach(a => { a.tagIds = a.tagIds.filter(x => x !== tid); });
  return resp(true, '删除成功');
});
M('PUT /candidates/{id}/tags', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '候选人不存在', data: null };
  a.tagIds = (b.tagIds || []).map(Number);
  return resp(true, '标签更新成功');
});

/* ============ 11. 面试安排与评价 ============ */
M('POST /interviews', (b) => {
  const a = DB.applications.find(x => x.id === Number(b.applicationId));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  if (!b.interviewTime) return { code: 400, message: '面试时间不能为空', data: null };
  if ([3, 8, 9].includes(a.status)) return { code: 400, message: '当前状态「' + APP_STATUS[a.status] + '」不可安排面试', data: null };
  const iv = Object.assign({
    id: nextId(DB.interviews), candidateName: a.candidateName, jobId: a.jobId, jobTitle: a.jobTitle,
    round: (DB.interviews.filter(i => i.applicationId === a.id).length + 1),
    result: 0, status: 1, notifyStatus: 1, createTime: nowStr()
  }, b);
  DB.interviews.push(iv);
  if ([1, 2, 4].includes(a.status)) {
    DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: 4, operator: b.interviewerName || '龚清', remark: '发送面试邀约（第' + iv.round + '轮）', createTime: nowStr() });
    a.status = 4;
  }
  return resp({ id: iv.id, round: iv.round, notifyChannel: iv.notifyChannel }, '面试安排成功，通知已发送');
});
M('GET /interviews', (b, q) => {
  let list = DB.interviews.slice();
  if (q.applicationId) list = list.filter(i => i.applicationId === Number(q.applicationId));
  if (q.jobId) list = list.filter(i => i.jobId === Number(q.jobId));
  if (q.interviewerId) list = list.filter(i => i.interviewerId === Number(q.interviewerId));
  if (q.result !== undefined && q.result !== '') list = list.filter(i => String(i.result) === String(q.result));
  if (q.date) list = list.filter(i => i.interviewTime.slice(0, 10) === q.date);
  if (q.keyword) list = list.filter(i => (i.candidateName + i.jobTitle + i.interviewerName).includes(q.keyword));
  list.sort((a, b) => String(a.interviewTime).localeCompare(String(b.interviewTime)));
  const mapped = list.map(i => Object.assign({}, i, {
    resultName: ({ 0: '待面试', 1: '通过', 2: '未通过' })[i.result],
    resultType: ({ 0: 'info', 1: 'success', 2: 'danger' })[i.result],
    methodName: ({ 1: '现场面试', 2: '视频面试' })[i.method] || '-'
  }));
  return pageResp(mapped, q.pageNum, q.pageSize);
});
M('PUT /interviews/{id}', (b, q, t, id) => {
  const iv = DB.interviews.find(x => x.id === Number(id));
  if (!iv) return { code: 404, message: '面试记录不存在', data: null };
  Object.assign(iv, b);
  if (b.result !== undefined && Number(b.result) !== 0) {
    const a = DB.applications.find(x => x.id === iv.applicationId);
    if (a) {
      const to = Number(b.result) === 1 ? 6 : 3;
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: to, operator: iv.interviewerName || '李维', remark: b.comment || (to === 6 ? '面试通过' : '面试未通过'), createTime: nowStr() });
      a.status = to;
      if (b.score) a.score = b.score;
      if (to === 3) a.screenRemark = b.comment || '面试未通过';
    }
  }
  return resp(true, '面试结果已保存');
});
/* 再次发送面试通知 */
M('POST /interviews/{id}/notify', (b, q, t, id) => {
  const iv = DB.interviews.find(x => x.id === Number(id));
  if (!iv) return { code: 404, message: '面试记录不存在', data: null };
  iv.notifyStatus = 1;
  iv.notifyChannel = b.channel || iv.notifyChannel;
  iv.notifyTime = nowStr();
  return resp({ notifyChannel: iv.notifyChannel, notifyTime: iv.notifyTime }, '已通过「' + iv.notifyChannel + '」通知候选人');
});
M('POST /applications/{id}/start-interview', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  const allowed = (FLOW[a.status] || []).map(x => x.to);
  if (!allowed.includes(5)) return { code: 400, message: '当前状态不可开始面试', data: null };
  DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: 5, operator: '李维', remark: '候选人已到场，面试进行中', createTime: nowStr() });
  a.status = 5;
  return resp(true, '已置为面试中');
});

/* ============ 12. 录用与 offer ============ */
M('POST /offers', (b) => {
  const a = DB.applications.find(x => x.id === Number(b.applicationId));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  if (a.status !== 6) return { code: 400, message: '只有「面试通过」的候选人才能发放 offer', data: null };
  if (!b.salary) return { code: 400, message: '请填写 offer 薪资', data: null };
  DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: 6, toStatus: 7, operator: b.operator || '龚清', remark: '发放 offer：' + b.salary + (b.entryDate ? '，预计入职 ' + b.entryDate : ''), createTime: nowStr() });
  a.status = 7; a.offerSalary = b.salary; a.entryDate = b.entryDate || null; a.updateTime = nowStr();
  return resp(true, 'offer 已发放');
});
M('GET /offers', (b, q) => {
  let list = DB.applications.filter(a => [6, 7, 8].includes(a.status)).map(a => ({
    id: a.id, candidateName: a.candidateName, jobTitle: a.jobTitle, score: a.score,
    status: a.status, statusName: APP_STATUS[a.status], statusType: APP_STATUS_TYPE[a.status],
    offerSalary: a.offerSalary || '', entryDate: a.entryDate || '', school: a.school, education: a.education
  }));
  if (q.status) list = list.filter(x => x.status === Number(q.status));
  if (q.keyword) list = list.filter(x => (x.candidateName + x.jobTitle).includes(q.keyword));
  return pageResp(list, q.pageNum, q.pageSize);
});
M('POST /applications/{id}/entry', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  if (a.status !== 7) return { code: 400, message: '只有「已发offer」状态可确认入职', data: null };
  DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: 7, toStatus: 8, operator: b.operator || '龚清', remark: '候选人确认入职' + (b.entryDate ? '，入职日期 ' + b.entryDate : ''), createTime: nowStr() });
  a.status = 8; a.entryDate = b.entryDate || a.entryDate;
  return resp(true, '入职确认成功');
});
M('POST /applications/{id}/reject', (b, q, t, id) => {
  const a = DB.applications.find(x => x.id === Number(id));
  if (!a) return { code: 404, message: '投递记录不存在', data: null };
  const allowed = (FLOW[a.status] || []).map(x => x.to);
  if (!allowed.includes(9)) return { code: 400, message: '当前状态不可标记为拒绝', data: null };
  DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: a.id, fromStatus: a.status, toStatus: 9, operator: b.operator || a.candidateName, remark: b.reason || '候选人拒绝 offer', createTime: nowStr() });
  a.status = 9;
  return resp(true, '已记录候选人拒绝');
});

/* ============ 13. 看板与日志 ============ */
M('GET /dashboard/overview', () => resp({
  jobTotal: DB.jobs.length,
  jobOnline: DB.jobs.filter(j => j.status === 1).length,
  resumeTotal: DB.applications.filter(a => a.parsed === 1).length,
  candidateTotal: DB.applications.length,
  interviewToday: DB.interviews.filter(i => i.interviewTime.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
  offerPending: DB.applications.filter(a => a.status === 7).length,
  deptTotal: DB.depts.length,
  userTotal: DB.users.length
}));
M('GET /dashboard/funnel', (b, q) => {
  const scope = q.jobId ? DB.applications.filter(a => a.jobId === Number(q.jobId)) : DB.applications;
  const total = scope.length;
  const funnel = FUNNEL_STAGES.map((s, i) => {
    const count = scope.filter(a => a.status >= s.status && a.status !== 9 && a.status !== 3).length;
    return { stage: s.name, status: s.status, count: count, rate: i === 0 ? 100 : (total ? Math.round(count / total * 1000) / 10 : 0) };
  });
  const hired = scope.filter(a => a.status === 8).length;
  const offers = scope.filter(a => [7, 8].includes(a.status)).length;
  const passRate = total ? Math.round(scope.filter(a => a.status >= 2).length / total * 1000) / 10 : 0;
  return resp({
    total: total, funnel: funnel,
    interviewing: scope.filter(a => [4, 5].includes(a.status)).length,
    offers: offers, hired: hired, passRate: passRate,
    avgCycleDays: hired ? Math.round(30 / hired * 2) : 15
  });
});
M('GET /dashboard/job-rank', () => {
  const rank = DB.jobs.map(j => ({
    jobId: j.id, title: j.title, views: j.views,
    applies: DB.applications.filter(a => a.jobId === j.id).length
  })).sort((a, b) => b.applies - a.applies);
  return resp(rank);
});
M('GET /system/logs', (b, q) => {
  let list = DB.flowLogs.slice().reverse().map(f => {
    const a = DB.applications.find(x => x.id === f.applicationId) || {};
    return {
      id: f.id, module: '招聘流程',
      action: (APP_STATUS[f.fromStatus] || '—') + ' → ' + (APP_STATUS[f.toStatus] || '—'),
      target: (a.candidateName || '-') + ' / ' + (a.jobTitle || '-'),
      operator: f.operator, ip: '192.168.1.' + (f.id % 200 + 10),
      remark: f.remark, createTime: f.createTime
    };
  });
  if (q.keyword) list = list.filter(l => (l.target + l.operator + l.remark).includes(q.keyword));
  if (q.module) list = list.filter(l => l.module === q.module);
  return pageResp(list, q.pageNum, q.pageSize);
});

/* ---------- Mock 调度：按 "METHOD 路径" 匹配，支持 /x/{id} 占位 ---------- */
async function mockRequest(method, url, body, token) {
  const [path, search] = url.split('?');
  const query = {};
  new URLSearchParams(search || '').forEach((v, k) => { query[k] = v; });
  query.__token = token;

  let key = method + ' ' + path, id = null;
  if (!Mock[key]) {
    const hit = Object.keys(Mock).find(k => {
      const [km, kp] = k.split(' ');
      if (km !== method || !kp.includes('{')) return false;
      const re = new RegExp('^' + kp.replace(/\{[^}]+\}/g, '([^/]+)') + '$');
      const m = re.exec(path);
      if (m) { id = m[1]; return true; }
      return false;
    });
    if (hit) key = hit;
  }
  if (!Mock[key]) return { code: 404, message: 'Mock 未实现的接口：' + method + ' ' + path, data: null };
  await new Promise(r => setTimeout(r, API_CONFIG.mockDelay + Math.random() * 40));
  const out = Mock[key](body || {}, query, token, id);
  return out === undefined ? resp(null) : out;
}

/* ---------- 统一请求封装 ---------- */
async function request(method, url, data) {
  const token = localStorage.getItem('recruit_token') || '';
  let fullUrl = url;
  if (method === 'GET' && data) {
    const qs = new URLSearchParams();
    Object.keys(data).forEach(k => {
      const v = data[k];
      if (v !== '' && v !== null && v !== undefined) qs.append(k, v);
    });
    const s = qs.toString();
    if (s) fullUrl += '?' + s;
  }
  if (API_CONFIG.useMock) return mockRequest(method, fullUrl, data, token);

  const res = await fetch(API_CONFIG.baseURL + fullUrl, {
    method: method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: method === 'GET' ? undefined : JSON.stringify(data || {})
  });
  if (res.status === 401) {
    localStorage.removeItem('recruit_token');
    if (location.hash !== '#/login') location.hash = '/login';
    throw new Error('登录状态已失效，请重新登录');
  }
  return await res.json();
}
const http = {
  get: (u, p) => request('GET', u, p),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u, p) => request('DELETE', u, p),
  upload: (u, file, onProgress) => {
    /* 简历文件上传：真实环境走 multipart/form-data，Mock 环境直接返回文件信息 */
    if (API_CONFIG.useMock) {
      return mockRequest('POST', '/resume/upload?fileName=' + encodeURIComponent(file.name), {}, localStorage.getItem('recruit_token') || '')
        .then(r => {
          if (onProgress) onProgress(100);
          return r;
        });
    }
    const fd = new FormData();
    fd.append('file', file);
    return fetch(API_CONFIG.baseURL + u, {
      method: 'POST', body: fd,
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('recruit_token') || '') }
    }).then(r => r.json());
  }
};
