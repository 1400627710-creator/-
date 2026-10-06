CREATE TABLE IF NOT EXISTS sessions (
	id INTEGER NOT NULL, 
	title VARCHAR(80) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	use_default_assumptions BOOLEAN NOT NULL, 
	last_error TEXT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS settings (
	"key" VARCHAR(40) NOT NULL, 
	value TEXT NOT NULL, 
	PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS messages (
	id INTEGER NOT NULL, 
	session_id INTEGER NOT NULL, 
	role VARCHAR(16) NOT NULL, 
	kind VARCHAR(16) NOT NULL, 
	content TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_messages_session_id ON messages (session_id);

CREATE TABLE IF NOT EXISTS generations (
	id INTEGER NOT NULL, 
	session_id INTEGER NOT NULL, 
	source_message_id INTEGER NOT NULL, 
	assistant_message_id INTEGER NOT NULL, 
	output_markdown TEXT NOT NULL, 
	model VARCHAR(100) NOT NULL, 
	temperature FLOAT NOT NULL, 
	used_default_assumptions BOOLEAN NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(source_message_id) REFERENCES messages (id) ON DELETE CASCADE, 
	UNIQUE (assistant_message_id), 
	FOREIGN KEY(assistant_message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_generations_session_id ON generations (session_id);

CREATE TABLE IF NOT EXISTS tool_tasks (
	id VARCHAR(32) NOT NULL, 
	request_key VARCHAR(80) NOT NULL, 
	request_hash VARCHAR(64) NOT NULL, 
	session_id INTEGER NOT NULL, 
	source_message_id INTEGER NOT NULL, 
	context_message_id INTEGER NOT NULL, 
	assistant_message_id INTEGER, 
	use_default_assumptions BOOLEAN NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	validation_failures INTEGER NOT NULL, 
	result_hash VARCHAR(64), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (request_key), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(source_message_id) REFERENCES messages (id) ON DELETE CASCADE, 
	FOREIGN KEY(assistant_message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_tool_tasks_session_id ON tool_tasks (session_id);
