# Known ground-truth spec issues

Real specs are sometimes wrong or incomplete: a field the API always returns but the spec marks optional, an undocumented endpoint, a wrong type. When scoring finds a mismatch, check the actual traffic first. If the spec is wrong, record it here so it isn't counted as an engine failure.

One entry per issue:

```
## <app>: <METHOD> <path>, <short description>

- **Spec says:** ...
- **Traffic shows:** ... (recording file and request)
- **Scoring:** excluded | adjusted (how)
- **Found:** YYYY-MM-DD, task or PR
```

No issues recorded yet. The first comparison happens in task 1.12.
