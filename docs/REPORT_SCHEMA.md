# Отчёт занятия: рабочий формат

Отдельный файл `lesson_report_schema_1.0.json`, упомянутый в исходных материалах, отсутствует. Поэтому реализованный валидатор основан на образце в U01 и не выдаётся за полную проверку отсутствующей официальной JSON Schema. Версия 1.1 — рабочее расширение, требующее согласования.

Общие поля: `schemaVersion`, `lessonId`, `lessonStatus`, `coveredTopics`, `assessment` (`maxScore`, `earnedScore`, `questions`), `homework`, `knowledgeGaps`, `strongSkills`, `nextLessonInstructions` и `studentNotes`. Для U01/U02 проверяются восемь уникальных ID Q01–Q08, максимум 16, соответствие суммы результатам `correct=2`, `partial=1`, `incorrect=0`; каждый ответ на 0/1 должен иметь флаг повторной проверки и отдельную строку с ID в `mandatoryRechecks`. Для U01 сервер требует четыре официальных ID ДЗ; для U02 — три.

В 1.1 к полному отчёту добавляется:

```json
{
  "entryControl": {
    "previousLessonId": "M01-T01-U01",
    "homeworkResults": [
      {"homeworkId": "M01-T01-U01-HW01", "status": "needs_revision", "feedback": "Фактический разбор", "errors": ["Фактическая ошибка"], "skillIds": ["skill-id"], "needsRevision": true}
    ],
    "recheckResults": [
      {"sourceQuestionId": "Q05", "status": "persists", "evidence": "Фактический ответ"},
      {"sourceGapId": "gap-id", "sourceLessonId": "M01-T01-U01", "status": "resolved", "evidence": "Фактический ответ"}
    ]
  }
}
```

Пример показывает только дополнительный блок, не полный отчёт. `errors`, `skillIds`, `needsRevision` необязательны. Статусы ДЗ: `checked`, `needs_revision`, `not_submitted`; повторных проверок: `persists`, `resolved`. Вопрос без sourceLessonId относится к предыдущему уроку; старый пробел можно адресовать по sourceGapId и sourceLessonId. ID проверяются на принадлежность ученику; факт устранения предварительный. В v1.0 блок отсутствует и статусы прежних ДЗ не меняются.

Сырые данные отчёта хранятся с попыткой; JSON проверяет структуру и внутреннюю согласованность, но не подтверждает содержание ответов и сам факт занятия.
