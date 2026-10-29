# Library: recipes and your media

Two indexed, searchable databases that the app and your AI agent browse the same way. Both are local: nothing leaves your computer, and no file system path, remote link or key is ever in a reply.

## Recipes (the workflows database)

One list of everything you can make, and how:

| Kind | What it is | Runs? |
|---|---|---|
| `workflow` | Every workflow on the Workflows page, with its tool, its models (where each runs and the price) and its real example with the prompt that made it | Yes, in the app |
| `chain` | The multi-step chains (portrait → voice → talking presenter, picture → 3D → spin…), each step with its tool and model | Yes, step by step |
| `skill` | Every agent skill in `skills/` (its flow and the tools it calls) | Yes, by your agent |
| `saved` | Looks you saved from a result | Yes, in the app |
| `idea` | Researched workflows that are **not built** yet, with where the idea comes from | No: shown as "Ideas, not built yet" |

Ideas are read from a private file that is not part of the repo: `OPENHIGGSFIELD_WORKFLOW_IDEAS=<path to a JSON file>`, else `<data dir>/workflow-ideas.json`. No file, no ideas. The file is a list (or `{ "entries": [...] }`) of `{ id, name, job, category, steps, inputs, outputs, models, runs_on, price_per_run, source_url, source_title, author, licence }`.

```
GET /api/library/workflows?q=&media=&kind=&status=&limit=&offset=
GET /api/library/workflows/:id        # + canvas: a canvas_batch plan to put it on a board
```

`media` matches what a recipe takes or makes (`text`, `image`, `video`, `audio`, `3d`); `kind` is a comma list; `status` is `ready` or `idea`.

## References (your media)

Every result you made (each output), every upload and saved element, and the app's own examples. Each item has its kind (image, video, audio, 3D), app URL, thumbnail, size or length, date, prompt, model, workflow, project, tags and favourite, and its source (`generated`, `uploaded`, `example`). Results in Trash and files that are gone are left out.

Tags are the prompt's subject words (picked automatically) plus your own.

```
GET    /api/library/references?q=&kind=&source=&model=&project=&fav=&tag=&since=&until=&limit=&cursor=
GET    /api/library/references/:id
POST   /api/library/references/:id/tags   {"tag": "hero shot"}
DELETE /api/library/references/:id/tags/:tag
```

`project` is a project id or `none`; `since` / `until` take an ISO date or milliseconds; `cursor` is the `nextCursor` of the previous page.

## Search

Both use the same small ranked index (`server/src/shared/bm25.ts`, BM25 over weighted fields, no paid embeddings): a word in the name counts more than in the tags, which counts more than in the description or prompt. Every word must match; the last one also matches as a prefix while you type. Built recipes rank above ideas. The index is built on first use and rebuilt when what it reads changes (results, uploads, projects, tags, saved looks, skills, the ideas file, or the models and places of the tool catalogue).

## In the app

- **Workflows**: the search box ranks with this index; "Ideas, not built yet" lists the researched ideas.
- **Media picker** (every upload slot): a search box searches your uploads, generations or liked results by prompt and tag.
- **Canvas › Assets**: a search box finds a result to drop on the board.

## For agents

The MCP tools `search_workflows`, `get_workflow_recipe`, `search_references` and `get_reference` (in the default toolset) wrap these routes. See [MCP.md](MCP.md#library-recipes-and-your-media).
