{{/* Resource name: the release name, unless it already contains the chart name. */}}
{{- define "posts-api.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "posts-api.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "posts-api.labels" -}}
{{ include "posts-api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* repository@digest when a digest is set, repository:tag otherwise (tag defaults to appVersion). */}}
{{- define "posts-api.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end -}}

{{- define "posts-api.secretName" -}}
{{- default (include "posts-api.fullname" .) .Values.database.existingSecret -}}
{{- end -}}

{{- define "posts-api.secretKey" -}}
{{- if .Values.database.existingSecret -}}{{ .Values.database.existingSecretKey }}{{- else -}}password{{- end -}}
{{- end -}}

{{- define "posts-api.registrySecretName" -}}
{{- printf "%s-registry" (include "posts-api.fullname" .) -}}
{{- end -}}

{{/*
Configuration objects are pre-install/pre-upgrade hooks with a lower weight than the migrations
Job, so they exist before the Job runs on the first install. They are recreated on each upgrade.
*/}}
{{- define "posts-api.configHook" -}}
helm.sh/hook: pre-install,pre-upgrade
helm.sh/hook-weight: "-5"
helm.sh/hook-delete-policy: before-hook-creation
{{- end -}}

{{- define "posts-api.configData" -}}
PORT: "3000"
LOG_LEVEL: {{ .Values.config.logLevel | quote }}
SHUTDOWN_TIMEOUT_MS: {{ .Values.config.shutdownTimeoutMs | quote }}
DB_HOST: {{ .Values.database.host | quote }}
DB_PORT: {{ .Values.database.port | quote }}
DB_USER: {{ .Values.database.user | quote }}
DB_NAME: {{ .Values.database.name | quote }}
DB_SSL: {{ .Values.database.ssl | quote }}
DB_POOL_MAX: {{ .Values.database.poolMax | quote }}
{{- end -}}

{{/* Shared by the Deployment and the migrations Job. */}}
{{- define "posts-api.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 65532
runAsGroup: 65532
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "posts-api.containerSecurityContext" -}}
readOnlyRootFilesystem: true
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}

{{- define "posts-api.imagePullSecrets" -}}
{{- $secrets := .Values.imagePullSecrets -}}
{{- if .Values.imageCredentials.registry -}}
{{- $secrets = append $secrets (dict "name" (include "posts-api.registrySecretName" .)) -}}
{{- end -}}
{{- with $secrets }}
imagePullSecrets:
{{ toYaml . }}
{{- end -}}
{{- end -}}

{{- define "posts-api.env" -}}
envFrom:
  - configMapRef:
      name: {{ include "posts-api.fullname" . }}
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: {{ include "posts-api.secretName" . }}
        key: {{ include "posts-api.secretKey" . }}
{{- end -}}
