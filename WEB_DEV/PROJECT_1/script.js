
// 1. DIGITAL CLOCK

function updateClock() {
  const now = new Date();

  document.getElementById("clock").textContent =
    now.toLocaleTimeString();

  document.getElementById("date").textContent =
    now.toDateString();
}

updateClock();
setInterval(updateClock, 1000);

// 2. GET HTML ELEMENTS

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const notes = document.getElementById("notes");
const saveStatus = document.getElementById("saveStatus");

let tasks = [];

// 3. SAVE TASKS

function saveTasks() {
  chrome.storage.local.set({ tasks: tasks });
}

// 4. DISPLAY TASKS

function displayTasks() {
  taskList.innerHTML = "";

  tasks.forEach((task, index) => {
    const li = document.createElement("li");

    if (task.done) {
      li.classList.add("done");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;

    checkbox.addEventListener("change", () => {
      tasks[index].done = checkbox.checked;
      saveTasks();
      displayTasks();
    });

    const span = document.createElement("span");
    span.textContent = task.text;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "delete";

    deleteButton.addEventListener("click", () => {
      tasks.splice(index, 1);
      saveTasks();
      displayTasks();
    });

    li.append(checkbox, span, deleteButton);
    taskList.appendChild(li);
  });
}

// 5. ADD NEW TASK

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const taskText = taskInput.value.trim();

  if (taskText === "") return;

  tasks.push({
    text: taskText,
    done: false
  });

  saveTasks();
  displayTasks();

  taskInput.value = "";
});

// 6. SAVE NOTES AUTOMATICALLY

notes.addEventListener("input", () => {
  chrome.storage.local.set({ notes: notes.value }, () => {
    saveStatus.textContent = "Saved!";
  });
});

// 7. LOAD SAVED DATA

chrome.storage.local.get(["tasks", "notes"], (result) => {
  tasks = result.tasks || [];
  notes.value = result.notes || "";

  displayTasks();
});