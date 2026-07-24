# 予定ファイル構成

MVP開始時点では、必要な機能だけを作る。

```text
task-manager/
├─ public/
│  └─ icons/
│
├─ src/
│  ├─ app/
│  │  ├─ App.vue
│  │  └─ AppHeader.vue
│  │
│  ├─ features/
│  │  ├─ tasks/
│  │  │  ├─ components/
│  │  │  │  ├─ TaskCard.vue
│  │  │  │  ├─ TaskList.vue
│  │  │  │  ├─ TaskDetailSheet.vue
│  │  │  │  ├─ CompletionUndoToast.vue
│  │  │  │  └─ SubjectBadge.vue
│  │  │  ├─ useTasks.ts
│  │  │  ├─ task.types.ts
│  │  │  └─ task.utils.ts
│  │  │
│  │  ├─ calendar/
│  │  │  ├─ components/
│  │  │  │  ├─ CalendarView.vue
│  │  │  │  ├─ CalendarDay.vue
│  │  │  │  ├─ DayTaskList.vue
│  │  │  │  └─ WeekTimeline.vue
│  │  │  ├─ useCalendar.ts
│  │  │  └─ calendar.utils.ts
│  │  │
│  │  ├─ filters/
│  │  │  ├─ components/
│  │  │  │  ├─ TaskFilter.vue
│  │  │  │  └─ SubjectFilter.vue
│  │  │  └─ useTaskFilters.ts
│  │  │
│  │  └─ navigation/
│  │     ├─ BottomNavigation.vue
│  │     └─ useNavigation.ts
│  │
│  ├─ database/
│  │  ├─ db.ts
│  │  ├─ progress.repository.ts
│  │  └─ database.types.ts
│  │
│  ├─ shared/
│  │  ├─ components/
│  │  │  ├─ BaseButton.vue
│  │  │  ├─ BaseDialog.vue
│  │  │  ├─ BaseIconButton.vue
│  │  │  └─ EmptyState.vue
│  │  ├─ constants/
│  │  │  └─ subjects.ts
│  │  └─ utils/
│  │     └─ date.ts
│  │
│  ├─ mocks/
│  │  └─ tasks.ts
│  ├─ styles/
│  │  ├─ main.css
│  │  └─ tokens.css
│  ├─ main.ts
│  └─ env.d.ts
│
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ README.md
```

## 後から追加する構成

Google連携時:

```text
src/
├─ integrations/
│  └─ google/
│     ├─ google-auth.client.ts
│     ├─ classroom.client.ts
│     └─ classroom.mapper.ts
└─ schemas/
   └─ classroom.schema.ts
```

PWA化時:

```text
public/
├─ manifest.webmanifest
└─ pwa-icons/

src/
└─ pwa/
   └─ updateServiceWorker.ts
```

複数URLが必要になった場合のみ:

```text
src/router/
└─ index.ts
```

複雑な共有状態が必要になった場合のみ:

```text
src/stores/
├─ filter.store.ts
└─ sync.store.ts
```
