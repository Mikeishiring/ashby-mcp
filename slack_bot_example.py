#!/usr/bin/env python3
"""
Example Slack Bot Architecture with MCP Integration
This shows how to build a Slack bot that uses LLM + MCP server.
"""

import os
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.tools import StructuredTool
from langchain.memory import ConversationBufferMemory

# MCP server would run separately, tools accessed via HTTP or direct import
from ashby_client import AshbyClient

# Initialize Slack app
app = App(token=os.environ["SLACK_BOT_TOKEN"])

# Initialize LLM (Company API key recommended)
llm = ChatOpenAI(
    temperature=0.1,
    model="gpt-4-turbo-preview",
    openai_api_key=os.environ["COMPANY_OPENAI_API_KEY"]  # Use company key
)

# Initialize Ashby MCP client
ashby_client = AshbyClient()

# Memory for conversation context
conversation_memory = {}

# Define MCP tools as LangChain tools
def get_pipeline_overview():
    """Get pipeline overview from Ashby MCP"""
    summary = ashby_client.get_pipeline_summary()
    return f"Pipeline: {summary['total_active']} candidates, {summary['open_jobs']} open jobs"

def search_candidates(query: str):
    """Search candidates via MCP"""
    results = ashby_client.search_candidates(query)
    return f"Found {len(results)} candidates matching '{query}'"

# Convert to LangChain tools
tools = [
    StructuredTool.from_function(get_pipeline_overview),
    StructuredTool.from_function(search_candidates),
]

# Create agent prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a recruiting assistant for our company.
    Help with Ashby ATS queries, but be privacy-conscious.
    Only share information appropriate for the channel context.
    Use the available tools to get recruiting data."""),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# Create agent
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    memory=ConversationBufferMemory(memory_key="chat_history")
)

# Slack event handlers
@app.event("app_mention")
def handle_mention(event, say, logger):
    """Handle @bot mentions"""
    user = event["user"]
    text = event["text"]
    channel = event["channel"]
    thread_ts = event.get("thread_ts") or event["ts"]

    # Check if this is a recruiting channel or DM
    channel_info = app.client.conversations_info(channel=channel)
    is_private = channel_info["channel"]["is_private"]
    channel_name = channel_info["channel"].get("name", "")

    # Privacy check: Restrict to recruiting channels or DMs
    if not (is_private or "recruit" in channel_name.lower()):
        say(
            text="I can only discuss recruiting matters in private channels or recruiting-related channels.",
            thread_ts=thread_ts
        )
        return

    # Get user info for role-based access
    user_info = app.client.users_info(user=user)
    user_role = get_user_role(user_info["user"]["id"])

    # Process with LLM
    try:
        response = agent_executor.invoke({
            "input": text,
            "user_role": user_role,
            "channel_type": "private" if is_private else "recruiting_channel"
        })

        say(
            text=response["output"],
            thread_ts=thread_ts
        )

    except Exception as e:
        logger.error(f"Error processing request: {e}")
        say(
            text="Sorry, I encountered an error processing your request.",
            thread_ts=thread_ts
        )

def get_user_role(user_id: str) -> str:
    """Map Slack user to recruiting role (ADMIN/USER)"""
    # In production: Check user groups, roles, or database
    admin_users = os.environ.get("ADMIN_USERS", "").split(",")
    return "ADMIN" if user_id in admin_users else "USER"

if __name__ == "__main__":
    # Start the bot
    handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    handler.start()