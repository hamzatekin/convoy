import { useState } from 'react';
import { useQuery, useMutation, skipToken } from '@avvos/convoy/react';
import { api } from '../convoy/_generated/api';

type List = {
  id: string;
  name: string;
  createdAt: number;
};

type Todo = {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

function App() {
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="header">
        <h1>📋 Todo Lists</h1>
        <p className="subtitle">Built with Convoy</p>
      </header>

      <main className="main">
        <div className="panels">
          <ListsPanel selectedListId={selectedListId} onSelectList={setSelectedListId} />
          <TodosPanel listId={selectedListId} />
        </div>
      </main>
    </div>
  );
}

function ListsPanel({
  selectedListId,
  onSelectList,
}: {
  selectedListId: string | null;
  onSelectList: (id: string | null) => void;
}) {
  const [newListName, setNewListName] = useState('');

  const { data: lists, isLoading } = useQuery(api.lists.list, {});
  const createList = useMutation(api.lists.create);
  const removeList = useMutation(api.lists.remove);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    await createList({ name: newListName.trim() });
    setNewListName('');
  };

  const handleRemove = async (id: string) => {
    if (selectedListId === id) {
      onSelectList(null);
    }
    await removeList({ id });
  };

  return (
    <section className="panel lists-panel">
      <h2>Lists</h2>

      <form onSubmit={handleCreate} className="create-form">
        <input
          type="text"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name..."
          className="input"
        />
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>

      {isLoading ? (
        <p className="loading">Loading...</p>
      ) : (
        <ul className="list">
          {(lists as List[] | null)?.map((list) => (
            <li key={list.id} className={`list-item ${selectedListId === list.id ? 'selected' : ''}`}>
              <button className="list-item-content" onClick={() => onSelectList(list.id)}>
                {list.name}
              </button>
              <button className="btn btn-danger btn-small" onClick={() => handleRemove(list.id)} title="Delete list">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TodosPanel({ listId }: { listId: string | null }) {
  const [newTodoText, setNewTodoText] = useState('');

  const { data: todos, isLoading } = useQuery(api.todos.list, listId ? { listId, limit: 50 } : skipToken);
  const createTodo = useMutation(api.todos.create);
  const toggleTodo = useMutation(api.todos.toggle);
  const removeTodo = useMutation(api.todos.remove);
  const clearCompleted = useMutation(api.todos.clearCompleted);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim() || !listId) return;

    await createTodo({ listId, text: newTodoText.trim() });
    setNewTodoText('');
  };

  const handleClearCompleted = async () => {
    if (!listId) return;
    await clearCompleted({ listId });
  };

  if (!listId) {
    return (
      <section className="panel todos-panel">
        <div className="empty-state">
          <p>← Select a list to view todos</p>
        </div>
      </section>
    );
  }

  const todoList = todos as Todo[] | null;
  const completedCount = todoList?.filter((t) => t.completed).length ?? 0;

  return (
    <section className="panel todos-panel">
      <div className="todos-header">
        <h2>Todos</h2>
        {completedCount > 0 && (
          <button className="btn btn-secondary btn-small" onClick={handleClearCompleted}>
            Clear {completedCount} completed
          </button>
        )}
      </div>

      <form onSubmit={handleCreate} className="create-form">
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          placeholder="What needs to be done?"
          className="input"
        />
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>

      {isLoading ? (
        <p className="loading">Loading...</p>
      ) : (
        <ul className="list todos-list">
          {todoList?.map((todo) => (
            <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
              <label className="todo-label">
                <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo({ id: todo.id })} />
                <span className="todo-text">{todo.text}</span>
              </label>
              <button
                className="btn btn-danger btn-small"
                onClick={() => removeTodo({ id: todo.id })}
                title="Delete todo"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default App;
