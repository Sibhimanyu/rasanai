// Captured from real runs on 2026-10-06 (claude 2.1.287 with haiku, codex-cli 0.149.1 with gpt-5.5); ids and signatures shortened.
enum TelemetryFixtures {
    static let claude = [
        #"""
        {"type":"system","subtype":"session_state_changed","state":"running","uuid":"4fecd516-a59f-41e7-8ac6-71d81debeee7","session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e"}
        """#,
        #"""
        {"type":"system","subtype":"init","cwd":"/private/tmp/mon","session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","model":"claude-haiku-4-5-20251001"}
        """#,
        #"""
        {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfkbRjdUd7ZBCQaNoyE42","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":"sig"}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":10,"cache_creation_input_tokens":10083,"cache_read_input_tokens":14160,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10083},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","uuid":"8994f8f0-9dec-4657-aca1-5f2e9f32c414","timestamp":"2026-10-06T07:32:26.816Z","request_id":"req_011CfkbRjNqo9CHkgkrYYrvj","thinking_duration_ms":518}
        """#,
        #"""
        {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfkbRjdUd7ZBCQaNoyE42","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_018SeNrGj5QD3WuDL9CicfEH","name":"Bash","input":{"command":"echo hi","description":"Run echo command"},"caller":{"type":"direct"}}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":10,"cache_creation_input_tokens":10083,"cache_read_input_tokens":14160,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10083},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","uuid":"1b289851-5e93-418f-9363-d2fed3889807","timestamp":"2026-10-06T07:32:27.222Z","request_id":"req_011CfkbRjNqo9CHkgkrYYrvj"}
        """#,
        #"""
        {"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_018SeNrGj5QD3WuDL9CicfEH","type":"tool_result","content":"hi","is_error":false}]},"parent_tool_use_id":null,"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","uuid":"cbba62ef-894d-4b82-a44b-96515e3caa28","timestamp":"2026-10-06T07:32:28.408Z","tool_use_result":{"stdout":"hi","stderr":"","interrupted":false,"isImage":false,"noOutputExpected":false}}
        """#,
        #"""
        {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfkbRxxATfFz7DNf7mRe4","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":"sig"}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":8,"cache_creation_input_tokens":2511,"cache_read_input_tokens":24243,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2511},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","uuid":"129688c7-bf7a-47d0-a370-89ed9d891141","timestamp":"2026-10-06T07:32:29.816Z","request_id":"req_011CfkbRxj2FdMANjNTYp4Vd","thinking_duration_ms":413}
        """#,
        #"""
        {"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011CfkbRxxATfFz7DNf7mRe4","type":"message","role":"assistant","content":[{"type":"text","text":"Done"}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":8,"cache_creation_input_tokens":2511,"cache_read_input_tokens":24243,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2511},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"},"input_transformations":[],"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","uuid":"6ab4bd3e-7327-402a-ab8d-a25b789e7a50","timestamp":"2026-10-06T07:32:29.833Z","request_id":"req_011CfkbRxj2FdMANjNTYp4Vd"}
        """#,
        #"""
        {"session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e","total_cost_usd":0.0307803,"usage":{"input_tokens":18,"cache_creation_input_tokens":12594,"cache_read_input_tokens":38403,"output_tokens":156,"output_tokens_details":{"thinking_tokens":74},"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":12594,"ephemeral_5m_input_tokens":0},"inference_geo":"not_available","speed":"standard","fallback_credit":null},"modelUsage":{"claude-haiku-4-5-20251001":{"inputTokens":922,"outputTokens":166,"cacheReadInputTokens":38403,"cacheCreationInputTokens":12594,"webSearchRequests":0,"costUSD":0.0307803,"contextWindow":200000,"maxOutputTokens":32000,"thinkingTokens":74,"canonicalModel":"claude-haiku-4-5","provider":"firstParty","costBasis":"list"}},"is_error":false,"num_turns":2,"subtype":"success","result":"Done","type":"result","duration_ms":5732}
        """#,
        #"""
        {"type":"system","subtype":"session_state_changed","state":"idle","uuid":"e2842cdd-f040-4c0e-9f20-2743e34c9ef6","session_id":"9068466d-4168-4b49-9db2-c2ff98d1790e"}
        """#,
    ]
    static let codex = [
        #"""
        {"type":"thread.started","thread_id":"01a11021-1d21-7831-8ccd-6c5819ddec93"}
        """#,
        #"""
        {"type":"item.completed","item":{"id":"item_0","type":"error","message":"clamping SessionEnd hook timeout to 3s in /Users/sibhi-zstch1643/.codex/hooks.json"}}
        """#,
        #"""
        {"type":"turn.started"}
        """#,
        #"""
        {"type":"item.completed","item":{"id":"item_1","type":"error","message":"Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest."}}
        """#,
        #"""
        {"type":"item.started","item":{"id":"item_2","type":"command_execution","command":"/bin/bash -lc 'echo hi'","aggregated_output":"","exit_code":null,"status":"in_progress"}}
        """#,
        #"""
        {"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"/bin/bash -lc 'echo hi'","aggregated_output":"hi\n","exit_code":0,"status":"completed"}}
        """#,
        #"""
        {"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"done"}}
        """#,
        #"""
        {"type":"turn.completed","usage":{"input_tokens":40535,"cached_input_tokens":24320,"cache_write_input_tokens":0,"output_tokens":38,"reasoning_output_tokens":0}}
        """#,
    ]
    static let codexRollout = [
        #"""
        {"timestamp":"2026-10-06T07:32:52.506Z","type":"turn_context","payload":{"turn_id":"01a11021-1dd6-73c3-aca1-a1d0d030f394","model":"gpt-5.5"}}
        """#,
        #"""
        {"timestamp":"2026-10-06T07:32:55.608Z","ordinal":11,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":20227,"cached_input_tokens":4480,"cache_write_input_tokens":0,"output_tokens":33,"reasoning_output_tokens":0,"total_tokens":20260},"model_context_window":258400}}}
        """#,
        #"""
        {"timestamp":"2026-10-06T07:32:58.292Z","ordinal":14,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":40535,"cached_input_tokens":24320,"cache_write_input_tokens":0,"output_tokens":38,"reasoning_output_tokens":0,"total_tokens":40573},"model_context_window":258400}}}
        """#,
    ]
}
