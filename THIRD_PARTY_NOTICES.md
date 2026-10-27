# Third-party notices

## Activepieces pieces

`packages/integrations` and `apps/integrations` bundle the following npm packages, published from the
community pieces of [activepieces/activepieces](https://github.com/activepieces/activepieces)
(`packages/pieces/community`), unmodified:

`@activepieces/piece-github`, `-gitlab`, `-linear`, `-jira-cloud`, `-notion`, `-confluence`, `-asana`,
`-trello`, `-todoist`, `-figma`, `-google-sheets`, `-google-drive`, `-google-calendar`, `-gmail`, `-slack`, `-discord`,
`-resend`, `-zendesk`, `-stripe`, `-http`, `-microsoft-outlook`, `-microsoft-outlook-calendar`,
`-microsoft-excel-365`, `-microsoft-onedrive`, `-microsoft-sharepoint`, `-microsoft-teams`, `-microsoft-todo`,
`-microsoft-365-people`, `-microsoft-dynamics-365-business-central`, `-microsoft-dynamics-crm`, `-netsuite`,
`-odoo`, `-quickbooks`, `-xero`, `-zoho-books`, `-salesforce`, `-zoho-crm` (versions pinned in `packages/integrations/package.json`; catalog
metadata in `packages/integrations/src/generated/catalog.json` is derived from them).

The Activepieces repository is licensed as follows. Content under `packages/ee/` and
`packages/server/api/src/app/ee` is under a separate enterprise license and is **not** used here; everything
else, including the community pieces, is under the MIT (Expat) license:

```
Copyright (c) 2020-2024 Activepieces Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Each piece package is pre-bundled with its own dependencies (among them `@activepieces/pieces-framework`,
`@activepieces/pieces-common` and `@activepieces/shared` (MIT), `axios` (MIT), `zod` (MIT) and provider SDKs);
those components remain under the licenses provided by their owners, as the Activepieces license states.
