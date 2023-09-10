import os
import sys
import test_module as m

m.hello_world()

print(f'{os.cpu_count() = }')
print(f'{sys.argv=}')

# %% SECTION 1
for ii in range(10):
    print(f'{ii = }')

    # %% Section 1.1
    if (ii % 3):
        print(f'Hello, World # %% {ii} !')
    else:
        # %% Section 1.2
        print('Goodbye, World!!')

# %% TEST INDENTED STATEMENT
number = 11
if number % 2 == 1:
    print('That is Odd!?')
else:
    print('Why Even?')

for _ in range(3):
    # %% This Section Include 'Another Section?'
    print('It is what it says it is!')
    if (number < 5):
        print('It is less than something')
        # %% Subsection Run to Beginning of The Next Higher Section
        print('Or is it?')

    print('It includes the sub section!')

    # %% Just Want to Check
    print('If it did fooled you')

# %% EMPTY ZERO-CODELINE SECTION
# %% EMPTY MANY-CODELINE SECTION


# %% LAST SECTION
print('At the BOTTOM')
