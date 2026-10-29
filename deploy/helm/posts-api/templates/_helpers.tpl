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

{{/* The API pods only: the migrations Job shares the release labels but not this component. */}}
{{- define "posts-api.apiSelectorLabels" -}}
{{ include "posts-api.selectorLabels" . }}
app.kubernetes.io/component: api
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

{{/* The Secret holding the password; `suffix` names the migrations copy. */}}
{{- define "posts-api.secretName" -}}
{{- if .Values.database.existingSecret -}}
{{- .Values.database.existingSecret -}}
{{- else -}}
{{- printf "%s%s" (include "posts-api.fullname" .) (default "" .suffix) -}}
{{- end -}}
{{- end -}}

{{- define "posts-api.secretKey" -}}
{{- if .Values.database.existingSecret -}}{{ .Values.database.existingSecretKey }}{{- else -}}password{{- end -}}
{{- end -}}

{{- define "posts-api.registrySecretName" -}}
{{- printf "%s%s-registry" (include "posts-api.fullname" .) (default "" .suffix) -}}
{{- end -}}

{{/*
The migrations Job is a pre-install/pre-upgrade hook, so it runs before the release's own
objects exist. It gets hook copies of the configuration, created just before it and deleted with
it once every hook succeeded; the release objects stay normal, tracked resources.
*/}}
{{- define "posts-api.migrationsHook" -}}
helm.sh/hook: pre-install,pre-upgrade
helm.sh/hook-weight: "-5"
helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded
{{- end -}}

{{- define "posts-api.migrationsName" -}}
{{- printf "%s-migrations" (include "posts-api.fullname" .) -}}
{{- end -}}

{{/* Fails the render when values contradict each other. */}}
{{- define "posts-api.validate" -}}
{{- if lt (int .Values.autoscaling.maxReplicas) (int .Values.autoscaling.minReplicas) -}}
{{- fail (printf "autoscaling.maxReplicas (%d) must be at least autoscaling.minReplicas (%d)" (int .Values.autoscaling.maxReplicas) (int .Values.autoscaling.minReplicas)) -}}
{{- end -}}
{{- $needed := add (int .Values.preStopSleepSeconds) (div (int .Values.config.shutdownTimeoutMs) 1000) -}}
{{- if ge (int $needed) (int .Values.terminationGracePeriodSeconds) -}}
{{- fail (printf "terminationGracePeriodSeconds (%d) must exceed preStopSleepSeconds plus config.shutdownTimeoutMs in seconds (%d)" (int .Values.terminationGracePeriodSeconds) (int $needed)) -}}
{{- end -}}
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

{{/* Called with the root context, or with `suffix` set for the migrations copies. */}}
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
      name: {{ printf "%s%s" (include "posts-api.fullname" .) (default "" .suffix) }}
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: {{ include "posts-api.secretName" . }}
        key: {{ include "posts-api.secretKey" . }}
{{- end -}}
