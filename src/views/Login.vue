<template>
  <div class="login-container">
    <div class="login-card">
      <div class="card-header">
        <h1>{{ isRegister ? '用户注册' : '用户登录' }}</h1>
        <p class="subtitle">行摄天工 · 个性化旅游与旅拍导航系统</p>
      </div>

      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label for="username">用户名</label>
          <input
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名（支持中文）"
            maxlength="50"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            
            
            maxlength="128"
            placeholder="请输入8至128个字符密码"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
          />
        </div>

        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>

        <button type="submit" :disabled="loading" class="submit-btn">
          {{ loading ? '处理中...' : (isRegister ? '注册' : '登录') }}
        </button>
      </form>
      <div class="switch-mode">
        <span v-if="isRegister">已有账号？<a @click.prevent="toggleMode">去登录</a></span>
        <span v-else>没有账号？<a @click.prevent="toggleMode">去注册</a></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const isRegister = ref(false)
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

function toggleMode() {
  isRegister.value = !isRegister.value
  errorMsg.value = ''
  successMsg.value = ''
  username.value = ''
  password.value = ''
}

async function handleSubmit() {
  errorMsg.value = ''
  successMsg.value = ''

  if (!username.value.trim()) {
    errorMsg.value = '请输入用户名'
    return
  }

  if (!/^.{8,128}$/u.test(password.value)) {
    errorMsg.value = '密码必须为8至128个字符'
    return
  }

  loading.value = true

  try {
    const url = isRegister.value ? '/api/register' : '/api/login'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value
      })
    })

    const data = await res.json()

    if (!data.success) {
      errorMsg.value = data.error || '操作失败'
      return
    }

    if (isRegister.value) {
      successMsg.value = '注册成功！正在跳转到登录...'
      setTimeout(() => {
        isRegister.value = false
        successMsg.value = ''
      }, 1500)
    } else {
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      router.push(data.user?.role === 'admin' ? '/admin/diaries' : '/')
    }
  } catch {
    errorMsg.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 14% 18%, rgba(212, 165, 116, 0.18), transparent 28%),
    radial-gradient(circle at 86% 16%, rgba(192, 120, 88, 0.14), transparent 28%),
    linear-gradient(180deg, #fbf7f2 0%, #f7f2eb 100%);
  position: relative;
  overflow: hidden;
}

.login-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.28), transparent 40%),
    linear-gradient(315deg, rgba(212, 165, 116, 0.08), transparent 42%);
  animation: bgFloat 20s ease-in-out infinite;
}

@keyframes bgFloat {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-2%, -2%); }
}

.login-card {
  position: relative;
  width: min(460px, 100%);
  padding: 42px 36px;
  background: rgba(255, 252, 248, 0.94);
  border: 1px solid rgba(220, 207, 192, 0.92);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(43, 31, 20, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px);
  z-index: 1;
}

.login-card::after {
  content: '';
  position: absolute;
  top: 10px; left: 10px; right: 10px; bottom: 10px;
  border: 1px solid rgba(212, 165, 116, 0.18);
  border-radius: 18px;
  pointer-events: none;
}

.card-header {
  text-align: center;
  margin-bottom: 30px;
}

.card-header h1 {
  font-size: 30px;
  font-weight: 700;
  color: #2b1f14;
  margin: 0 0 10px 0;
  letter-spacing: 2px;
}

.subtitle {
  color: #6f5a45;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  color: #6f5a45;
  font-weight: 600;
  letter-spacing: 1px;
}

.form-group input {
  padding: 14px 16px;
  background: rgba(247, 242, 235, 0.88);
  border: 1px solid rgba(220, 207, 192, 0.92);
  border-radius: 14px;
  color: #2b1f14;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
}

.form-group input:focus {
  border-color: #d4a574;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.14);
}

.form-group input::placeholder {
  color: rgba(111, 90, 69, 0.46);
}

.error-msg {
  padding: 12px 16px;
  background: rgba(217, 83, 79, 0.08);
  border: 1px solid rgba(217, 83, 79, 0.16);
  border-radius: 14px;
  color: #bf4d47;
  font-size: 13px;
  text-align: center;
}

.success-msg {
  padding: 12px 16px;
  background: rgba(90, 158, 111, 0.1);
  border: 1px solid rgba(90, 158, 111, 0.18);
  border-radius: 14px;
  color: #456f52;
  font-size: 13px;
  text-align: center;
}

.submit-btn {
  padding: 14px;
  background: linear-gradient(135deg, #c07858, #9a5f45);
  border: 0;
  border-radius: 14px;
  color: #fffdf9;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  letter-spacing: 2px;
  margin-top: 4px;
  box-shadow: 0 16px 28px rgba(192, 120, 88, 0.24);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 20px 34px rgba(192, 120, 88, 0.3);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch-mode {
  text-align: center;
  margin-top: 28px;
  color: rgba(111, 90, 69, 0.72);
  font-size: 14px;
}

.switch-mode a {
  color: #a06045;
  cursor: pointer;
  font-weight: 600;
  transition: color 0.3s;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.switch-mode a:hover {
  color: #c07858;
}

@media (max-width: 640px) {
  .login-card {
    padding: 28px 20px;
    border-radius: 20px;
  }

  .card-header h1 {
    font-size: 26px;
  }
}
</style>
