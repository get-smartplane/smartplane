-- Above how many tools `tools/list` switches to search mode (smartplane__search_tools / smartplane__call_tool).
-- 0: always; NULL: never; default 40, where some MCP clients start warning about long tool lists.
ALTER TABLE orgs ADD COLUMN tool_search_threshold INTEGER DEFAULT 40 CHECK (tool_search_threshold IS NULL OR tool_search_threshold >= 0);
