Expected time: ~4-8 hours
Enclosed are two data sets that represent a slimmed-down version of ChartHop's actual data
model ( changes.json and persons.json ).
A job is represented by a series of date-stamped "change" objects
Changes can have one of 5 types:
CREATE — indicates when a job was created
HIRE — person starts job, job goes from open → filled
UPDATE — updates the job's attributes (e.g., manager, compensation, custom
fields)
DEPART — person departs job, job goes from filled → open
DELETE — job deleted from system
Only changes with an ACTIVE status should be considered
Changes are not necessarily sorted in historical order
A person is represented separately in a canonical object with no time-series component
The org chart is a tree constructed by connecting job nodes via their managerId
You may use any language and/or frameworks you would like. Our stack use Kotlin on the
backend and TypeScript on the frontend. Using one of these is a plus but not required.
Your solution should load the data from changes.json and persons.json for inmemory manipulation and implement the following:
getJobOnDate(jobId, date) — returns a snapshot of a job's state on a given date
getGraphOnDate(date) — returns a lightweight tree representing the org chart on a
Staff Software Engineer — Take-Home Assessment
The Data
Requirements
Core Methods
given date (the root node is the CEO)
getChangesBetweenDates(jobId, dateA, dateB) — returns a summary of what
changed for a given job between two dates. The output should clearly indicate which fields
changed and their before/after values.
getCompensationRollup(jobId, date) — returns the total base compensation for
the given job and all jobs reporting up through it (recursively). For example, calling this on
the CEO should return the sum of all base salaries in the org on that date.
exportOrgOnDate(date) — exports the full org state on a given date as a flat CSV
(or equivalent structured format) suitable for import into another system. Include at
minimum: job ID, title, person name (or "Open"), manager job ID, and base compensation.
The data set contains quality issues that reflect real-world conditions. Your solution should
handle these gracefully. In your NOTES.md, document:
Each data quality issue you encountered
How you chose to handle it and why
Any assumptions you made
In your NOTES.md, describe the time and space complexity of your getGraphOnDate()
and getCompensationRollup() implementations. If this dataset grew to 50,000 jobs with
500,000 changes, what would you change about your approach?
The following questions will help you verify your solution. Include the answers in your
NOTES.md:
1. What is the base salary of the job with ID 5a13d80dcfed7957fe6c04a5 on May 5th,
2019?
2. What does Samson Oren's job look like on April 30th, 2019?
3. How many open jobs exist on March 4th, 2018?
4. How many people and jobs report up to Samson Oren on June 15th, 2018?
Export
Data Quality
Scale
Verification Questions
5. What is the total base compensation rolling up to the CEO on June 15th, 2018?
6. What changed on the job with ID 5a13d80fcfed7957fe6c0511 between January 1st,
2018 and May 1st, 2019?
Submit your work as a Git repository with the full commit history intact. Do not squash or rewrite
your history before submission. We review commit history as part of our evaluation. We are not
judging whether you got everything right on the first try, but to understand how you work. We
want to see how you break down a problem, how your thinking evolves as you dig into the data,
and how you handle moments where you change direction or catch something you missed
earlier. A commit that says "realized my date filtering was off by one, fixing" tells us more about
your engineering instincts than a pristine history that hides the journey. Treat this the way you'd
treat a real working branch: commit early, commit often, and write meaningful commit messages.
We do not discourage the use of AI tools. If you choose to use AI assistants (Copilot, Claude,
ChatGPT, etc.), we ask that you:
1. Install and use git-ai to tag commits that involved AI assistance. This helps us understand
your workflow and where you apply AI as a tool vs. where you're driving the design and
implementation yourself.
2. In your NOTES.md, include a section on AI usage covering:
Which tools you used and for what purpose
Where AI was most/least helpful
Any cases where you had to correct or override AI-generated output
We value transparency here, not perfection. Using AI well is a skill; if you choose to use it, we
want to see how you wield it.
Working project with instructions to run
Full Git history (do not squash)
NOTES.md covering:
Setup steps
Time spent
Answers to verification questions
Submission
AI Tool Usage
What to Include
Data quality issues found and how you handled them
Complexity analysis and scaling discussion
AI usage (see above)
Any other assumptions or tradeoffs worth noting
Correctness and edge case handling
Data model design and code clarity
Scaling awareness and architectural thinking
Engineering process (commit history, incremental problem-solving)
Effective and transparent use of tooling
Communication quality (NOTES.md clarity and reasoning)
Test coverage and design
Evaluation Criteria